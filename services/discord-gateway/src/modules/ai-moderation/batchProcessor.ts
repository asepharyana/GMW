import { createChildLogger } from "@bete/shared/logger";
import { config } from "../../shared/config/config.js";
import { isAgeRestrictedMetadata } from "../message-capture/messageMetadata.js";
import { updateMessagesAIAnalysisBulk } from "../message-capture/messageStore.js";
import type { MessageRecord } from "../message-capture/types.js";
import {
  broadcastAnalysisCompleted,
  conversationErrorCooldown,
  conversationProcessing,
  LAST_ERROR,
  recordConversationBatchFailure,
  resetConversationBatchFailures,
  scheduleAutoDelete,
  workerPool,
} from "./circuitBreaker.js";
import { estimateTokens } from "./conversationContext.js";
import { enqueueIndividualFallbacks } from "./individualFallbackProcessor.js";

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
 * `tokensPerMessage` accounts for JSON structure overhead around each entry.
 * Uses a rough character-based token estimate (avoids async formatMessageForPrompt
 * since this function runs in a synchronous promise chain).
 */
export function pickBatchWithinBudget(
  messages: MessageRecord[],
  maxTokens: number,
  tokensPerMessage: number,
): MessageRecord[] {
  const batch: MessageRecord[] = [];
  let usedTokens = 0;

  for (const msg of messages) {
    const content = msg.edited_content ?? msg.content;
    // Accurate token count via tiktoken (+ overhead for JSON structure)
    const msgTokens = estimateTokens(content) + tokensPerMessage;

    if (usedTokens + msgTokens <= maxTokens) {
      batch.push(msg);
      usedTokens += msgTokens;
    }
  }

  return batch;
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

  const skippedRows = await updateMessagesAIAnalysisBulk(
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

async function postBatchReputationUpdate(rows: MessageRecord[]): Promise<void> {
  for (const row of rows) {
    if (row.ai_status === "clean") {
      import("./userReputationStore.js")
        .then((store) => store.recordCleanMessage(row.user_id, row.guild_id))
        .catch((e) =>
          logger.error({ error: e }, "Failed to record clean message streak"),
        );
    } else if (row.ai_status === "flagged" && row.ai_severity !== "none") {
      import("./userReputationStore.js")
        .then((store) =>
          store.recordInfraction(
            row.user_id,
            row.guild_id,
            row.ai_severity as "low" | "medium" | "high" | "critical",
          ),
        )
        .catch((e) =>
          logger.error({ error: e }, "Failed to record infraction penalty"),
        );
    }
  }
}

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

    // Do not broadcast or auto-delete if it's an API failure that will be reverted.
    for (const row of result.rows) {
      let isApiFailure = false;
      if (row.ai_status === "error") {
        try {
          const flags = JSON.parse(row.ai_moderation_flags ?? "[]") as string[];
          isApiFailure = flags.includes("analysis_api_failed");
        } catch {}
      }

      if (!isApiFailure) {
        broadcastAnalysisCompleted(row);
        scheduleAutoDelete(row);
      }
    }

    // Post-batch reputation updates (fire-and-forget)
    postBatchReputationUpdate(
      result.rows.filter((r) => {
        if (r.ai_status === "error") {
          try {
            const flags = JSON.parse(r.ai_moderation_flags ?? "[]") as string[];
            return !flags.includes("analysis_api_failed");
          } catch {
            return false;
          }
        }
        return true;
      }),
    );

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

    // Batch succeeded -- check for messages the LLM silently dropped or failed
    const incompleteMessages: MessageRecord[] = [];
    const parseFailedMessages: MessageRecord[] = [];
    const apiFailedMessages: MessageRecord[] = [];

    for (const msg of messages) {
      const row = result.rows.find((r) => r.id === msg.id);
      if (!row) {
        incompleteMessages.push(msg);
        continue;
      }
      if (row.ai_status === "error") {
        let flags: string[] = [];
        try {
          flags = JSON.parse(row.ai_moderation_flags ?? "[]") as string[];
        } catch {}

        if (flags.includes("analysis_incomplete")) {
          incompleteMessages.push(msg);
        } else if (flags.includes("analysis_parse_failed")) {
          parseFailedMessages.push(msg);
        } else if (flags.includes("analysis_api_failed")) {
          apiFailedMessages.push(msg);
        }
      }
    }

    const messagesForIndividualQueue = [
      ...incompleteMessages,
      ...parseFailedMessages,
    ];

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
      const revertedRows = await updateMessagesAIAnalysisBulk(
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
      ).catch((err) => {
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
