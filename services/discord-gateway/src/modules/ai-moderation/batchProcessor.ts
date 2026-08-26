import { createChildLogger } from "@/shared/logger/index";
import { config } from "../../shared/config/config.js";
import { isAgeRestrictedMetadata } from "../message-capture/messageMetadata.js";
import { messageStore } from "../message-capture/messageStore.js";
import type { MessageRecord } from "../message-capture/types.js";
import { pickBatchWithinBudget as pickBatchWithinBudgetPure } from "./batchBudget.js";
import {
  computeUploadPollDelayMs,
  partitionBatchOutcome,
} from "./batchOutcomeClassifier.js";
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

/**
 * Consecutive upload-pending poll counter per conversation (2026-08-25).
 * Drives the linear backoff ramp while attachments are still uploading;
 * cleared as soon as a batch comes back with no upload-pending targets.
 */
const conversationUploadPolls = new Map<string, number>();

export interface AnalysisWorkerResponse {
  ok: boolean;
  conversationKey: string;
  rows: MessageRecord[];
  error?: string;
  /** Explicit upload-in-flight signal from the batch race guard (2026-08-25). */
  uploadPendingIds?: string[];
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
  /** Set when upload-pending targets defer the next cycle by this many ms. */
  let deferredUploadRescheduleMs: number | null = null;
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

    // Batch succeeded -- partition per-message outcome explicitly (2026-08-25).
    // upload_pending targets are DEFERRED (never fanned out): the old code
    // treated them as incomplete -> individual queue -> requeue+250ms
    // reschedule -> hot ~300ms loop for the whole upload duration.
    const outcomeById = partitionBatchOutcome(messages, result);
    const messagesForIndividualQueue: MessageRecord[] = [];
    const apiFailedMessages: MessageRecord[] = [];
    const uploadPendingMessages: MessageRecord[] = [];

    for (const msg of messages) {
      switch (outcomeById.get(msg.id)) {
        case "upload_pending":
          uploadPendingMessages.push(msg);
          break;
        case "api_failed":
          // Preserve the dedicated api-failure semantics below: revert +
          // conversation cooldown instead of an immediate individual retry.
          apiFailedMessages.push(msg);
          break;
        case "completed":
          // Successfully analyzed — already broadcast + auto-delete scheduled
          // above. Do NOT re-enqueue for individual fallback.
          break;
        default:
          // incomplete / parse_failed / unexplained drops stay retryable via
          // the individual fallback queue (same semantics as before).
          messagesForIndividualQueue.push(msg);
          break;
      }
    }

    if (uploadPendingMessages.length > 0) {
      const polls = (conversationUploadPolls.get(conversationKey) ?? 0) + 1;
      conversationUploadPolls.set(conversationKey, polls);
      const delayMs = computeUploadPollDelayMs(
        polls,
        config.AI_ANALYSIS_UPLOAD_POLL_MS,
        config.AI_ANALYSIS_MAX_UPLOAD_POLL_MS,
      );
      logger.debug(
        {
          conversationKey,
          count: uploadPendingMessages.length,
          ids: uploadPendingMessages.map((m) => m.id),
          pollAttempt: polls,
          delayMs,
        },
        "Attachment upload in-flight for batch targets — deferring with poll backoff",
      );

      // Put the rows back to `pending` so the scheduler owns them again.
      await messageStore
        .updateMessagesAIAnalysisBulk(
          uploadPendingMessages.map((msg) => ({
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
        .catch((err: unknown) => {
          logger.error(
            { error: String(err), ids: uploadPendingMessages.map((m) => m.id) },
            "Failed to revert upload-pending batch targets to pending",
          );
          return [] as MessageRecord[];
        });

      // Poll backoff instead of the 250ms debounce: the finally-block
      // schedules the next cycle after this delay instead of immediately.
      deferredUploadRescheduleMs = delayMs;
    } else {
      conversationUploadPolls.delete(conversationKey);
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
    // Upload-pending defer owns the next-cycle timing; don't let the default
    // immediate schedule override it.
    if (deferredUploadRescheduleMs === null) {
      shouldScheduleNext = true;
    }
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
    if (deferredUploadRescheduleMs !== null) {
      // Upload still in-flight: re-schedule after the backoff delay instead of
      // immediately (the old path hot-looped at ~250-300ms per cycle).
      const delayMs = deferredUploadRescheduleMs;
      setTimeout(() => {
        // Dynamic import to avoid circular dependency at module scope
        import("./batchScheduler.js").then((m) =>
          m.scheduleConversationAnalysis(conversationKey),
        );
      }, delayMs).unref();
    } else if (shouldScheduleNext) {
      setImmediate(() => {
        // Dynamic import to avoid circular dependency at module scope
        import("./batchScheduler.js").then((m) =>
          m.scheduleConversationAnalysis(conversationKey),
        );
      });
    }
  }
}
