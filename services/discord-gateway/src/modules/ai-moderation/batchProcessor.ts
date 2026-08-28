import { createChildLogger } from "@/shared/logger/index";
import { config } from "../../shared/config/config.js";
import { isAgeRestrictedMetadata } from "../message-capture/messageMetadata.js";
import { messageStore } from "../message-capture/messageStore.js";
import type { MessageRecord } from "../message-capture/types.js";
import { pickBatchWithinBudget as pickBatchWithinBudgetPure } from "./batchBudget.js";
import { partitionBatchOutcome } from "./batchOutcomeClassifier.js";
import { workerPool } from "./circuitBreaker.js";
import { estimateTokens } from "./conversationContext.js";
import {
  conversationErrorCooldown,
  conversationProcessing,
  recordConversationBatchFailure,
  resetConversationBatchFailures,
} from "./conversationState.js";
import { enqueueIndividualFallbacks } from "./individualFallbackProcessor.js";
import {
  broadcastAnalysisCompleted,
  LAST_ERROR,
  scheduleAutoDelete,
} from "./moderationState.js";

const logger = createChildLogger("batch-processor");

export interface AnalysisWorkerResponse {
  ok: boolean;
  conversationKey: string;
  rows: MessageRecord[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Observability
// ---------------------------------------------------------------------------

export let activeRequests = 0;

// ---------------------------------------------------------------------------
// Exported helpers
// ---------------------------------------------------------------------------

/**
 * Picks a batch of messages within a token budget.
 * Thin wrapper over the pure helper in batchBudget.ts (kept here so the
 * existing import surface stays stable); passes the tiktoken-based
 * estimateTokens. See batchBudget.ts for the overflow-stopping semantics.
 */
export function pickBatchWithinBudget(
  messages: MessageRecord[],
  maxTokens: number,
  tokensPerMessage: number,
): MessageRecord[] {
  return pickBatchWithinBudgetPure(
    messages,
    maxTokens,
    tokensPerMessage,
    estimateTokens,
  );
}

// ---------------------------------------------------------------------------
// Age-restricted message helpers
// ---------------------------------------------------------------------------

export function isAgeRestrictedMessage(message: MessageRecord): boolean {
  return isAgeRestrictedMetadata(message.metadata);
}

export function buildAgeRestrictedSkipResult(): {
  status: "clean";
  flags: string | null;
  score: number;
  analysis: string;
  categories: string[];
  severity: "none";
  confidence: number;
  recommendedAction: "none";
  analyzedAt: number;
  error: null;
} {
  return {
    status: "clean",
    flags: JSON.stringify(["age_restricted"]),
    score: 0,
    analysis: "Skipped moderation for age-restricted content.",
    categories: ["age_restricted"],
    severity: "none",
    confidence: 1,
    recommendedAction: "none",
    analyzedAt: Date.now(),
    error: null,
  };
}

export async function skipAgeRestrictedMessages(
  messages: MessageRecord[],
): Promise<MessageRecord[]> {
  const ageRestrictedMessages = messages.filter(isAgeRestrictedMessage);
  if (ageRestrictedMessages.length === 0) {
    return messages;
  }

  const skippedRows = await messageStore.updateMessagesAIAnalysisBulk(
    ageRestrictedMessages.map((message) => ({
      messageId: message.id,
      result: buildAgeRestrictedSkipResult(),
    })),
  );

  for (const row of skippedRows) {
    broadcastAnalysisCompleted(row);
  }

  const skippedIds = new Set(
    ageRestrictedMessages.map((message) => message.id),
  );
  return messages.filter((message) => !skippedIds.has(message.id));
}

// ---------------------------------------------------------------------------
// Batch pipeline
// ---------------------------------------------------------------------------

export async function processBatch(
  conversationKey: string,
  messages: MessageRecord[],
  processingStartedAt: number,
): Promise<void> {
  if (messages.length === 0) {
    if (conversationProcessing.get(conversationKey) === processingStartedAt) {
      conversationProcessing.delete(conversationKey);
    }
    return;
  }
  const cooldownUntil = conversationErrorCooldown.get(conversationKey) ?? 0;
  if (Date.now() < cooldownUntil) {
    if (conversationProcessing.get(conversationKey) === processingStartedAt) {
      conversationProcessing.delete(conversationKey);
    }
    return;
  }

  activeRequests++;
  let shouldScheduleNext = false;
  try {
    const result = (await workerPool.run({
      type: "batch",
      conversationKey,
      messages,
    })) as AnalysisWorkerResponse;

    // Broadcast + auto-delete only for successfully analyzed rows.
    // Error rows (API failures, parse failures, incomplete) will be
    // retried by the individual fallback queue — do NOT schedule
    // auto-delete for them (they'd be logged as not_eligible anyway).
    for (const row of result.rows) {
      if (row.ai_status === "error") continue;
      broadcastAnalysisCompleted(row);
      scheduleAutoDelete(row);
    }

    if (!result.ok) {
      recordConversationBatchFailure(conversationKey);

      // Batch failed entirely -- fall back all messages to individual queue
      logger.warn(
        {
          conversationKey,
          messageCount: messages.length,
          error: result.error,
        },
        "Batch failed entirely -- routing all messages to individual fallback queue",
      );
      enqueueIndividualFallbacks(messages);

      LAST_ERROR.value = result.error ?? "Analysis worker failed";
      conversationErrorCooldown.set(
        conversationKey,
        Date.now() + config.AI_ANALYSIS_ERROR_COOLDOWN_MS,
      );
      logger.error(
        {
          conversationKey,
          error: LAST_ERROR.value,
          messageCount: messages.length,
          messageIds: messages.map((m) => m.id),
          cooldownUntil: new Date(
            Date.now() + config.AI_ANALYSIS_ERROR_COOLDOWN_MS,
          ).toISOString(),
          timestamp: new Date().toISOString(),
        },
        "Batch analysis failed, will retry after cooldown",
      );
      return;
    }

    // Batch succeeded -- partition per-message outcome (2026-08-25).
    const outcomeById = partitionBatchOutcome(messages, result);
    const messagesForIndividualQueue: MessageRecord[] = [];
    const apiFailedMessages: MessageRecord[] = [];

    for (const msg of messages) {
      switch (outcomeById.get(msg.id)) {
        case "completed":
          // Successfully analyzed — already broadcast + auto-delete scheduled
          // above. Do NOT re-enqueue for individual fallback.
          break;
        case "api_failed":
          // Preserve the dedicated api-failure semantics below: revert +
          // conversation cooldown instead of an immediate individual retry.
          apiFailedMessages.push(msg);
          break;
        default:
          // incomplete / parse_failed / unexplained drops stay retryable via
          // the individual fallback queue (same semantics as before).
          messagesForIndividualQueue.push(msg);
          break;
      }
    }

    if (messagesForIndividualQueue.length > 0) {
      logger.warn(
        {
          conversationKey,
          count: messagesForIndividualQueue.length,
          ids: messagesForIndividualQueue.map((m) => m.id),
          totalBatchSize: messages.length,
        },
        "Batch returned incomplete or unparseable results -- fanning out to individual fallback queue",
      );
      enqueueIndividualFallbacks(messagesForIndividualQueue);
    }

    if (apiFailedMessages.length > 0) {
      logger.warn(
        {
          conversationKey,
          count: apiFailedMessages.length,
          ids: apiFailedMessages.map((m) => m.id),
        },
        "Batch returned API failures -- reverting to pending to put back in queue",
      );

      // Revert to pending so they are picked up again
      const revertedRows = await messageStore
        .updateMessagesAIAnalysisBulk(
          apiFailedMessages.map((msg) => ({
            messageId: msg.id,
            result: {
              status: "pending",
              flags: null,
              score: null,
              analysis: null,
              categories: null,
              severity: null,
              confidence: null,
              recommendedAction: null,
              analyzedAt: null,
              error: null,
            },
          })),
        )
        .catch((err) => {
          logger.error(
            { error: String(err) },
            "Failed to revert API failures to pending",
          );
          return [];
        });

      for (const row of revertedRows) {
        broadcastAnalysisCompleted(row);
      }

      // Trigger conversation cooldown
      recordConversationBatchFailure(conversationKey);
      const existingCooldown =
        conversationErrorCooldown.get(conversationKey) ?? 0;
      const newCooldown = Date.now() + config.AI_ANALYSIS_ERROR_COOLDOWN_MS;
      if (newCooldown > existingCooldown) {
        conversationErrorCooldown.set(conversationKey, newCooldown);
      }

      // Release the processing lock immediately so the cooldown timer controls retry
      if (conversationProcessing.get(conversationKey) === processingStartedAt) {
        conversationProcessing.delete(conversationKey);
      }

      // Do NOT schedule next -- let the cooldown gate it
      shouldScheduleNext = false;
    }

    if (apiFailedMessages.length === 0) {
      resetConversationBatchFailures(conversationKey);
      conversationErrorCooldown.delete(conversationKey);
    }
    shouldScheduleNext = true;
  } catch (error) {
    recordConversationBatchFailure(conversationKey);

    logger.warn(
      { conversationKey, messageCount: messages.length },
      "Batch threw exception -- routing all messages to individual fallback queue",
    );
    enqueueIndividualFallbacks(messages);

    LAST_ERROR.value = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    const existingCatchCooldown =
      conversationErrorCooldown.get(conversationKey) ?? 0;
    const newCatchCooldown = Date.now() + config.AI_ANALYSIS_ERROR_COOLDOWN_MS;
    if (newCatchCooldown > existingCatchCooldown) {
      conversationErrorCooldown.set(conversationKey, newCatchCooldown);
    }
    logger.error(
      {
        conversationKey,
        error: LAST_ERROR.value,
        stack: errorStack,
        messageCount: messages.length,
        messageIds: messages.map((m) => m.id),
        cooldownUntil: new Date(
          Date.now() + config.AI_ANALYSIS_ERROR_COOLDOWN_MS,
        ).toISOString(),
        timestamp: new Date().toISOString(),
      },
      "Analysis worker failed, will retry after cooldown",
    );
  } finally {
    activeRequests--;
    if (conversationProcessing.get(conversationKey) === processingStartedAt) {
      conversationProcessing.delete(conversationKey);
    }
    if (shouldScheduleNext) {
      setImmediate(() => {
        // Dynamic import to avoid circular dependency at module scope
        import("./batchScheduler.js").then((m) =>
          m.scheduleConversationAnalysis(conversationKey),
        );
      });
    }
  }
}
