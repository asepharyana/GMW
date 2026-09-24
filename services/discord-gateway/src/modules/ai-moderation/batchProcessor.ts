import { createChildLogger } from "@/shared/logger/index";
import { config } from "../../shared/config/index.js";
import { isAgeRestrictedMetadata } from "../message-capture/messageMetadata.js";
import { messageStore } from "../message-capture/messageStore.js";
import type { MessageRecord } from "../message-capture/types.js";
import { pickBatchWithinBudget as pickBatchWithinBudgetPure } from "./batchBudget.js";
import { partitionBatchOutcome } from "./batchOutcomeClassifier.js";
import { mediaWorkerPool, textWorkerPool } from "./circuitBreaker.js";
import { estimateTokens } from "./conversationContext.js";
import {
  type AnalysisLane,
  clearConversationProcessing,
  conversationErrorCooldown,
  getConversationProcessingStartedAt,
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

/** User IDs whose messages are captured but never AI-analyzed (config). */
const AI_SKIP_ANALYSIS_USER_IDS = new Set(config.AI_SKIP_ANALYSIS_USER_IDS);

export interface AnalysisWorkerResponse {
  ok: boolean;
  conversationKey: string;
  rows: MessageRecord[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Observability (per-lane counters live alongside the aggregate)
// ---------------------------------------------------------------------------

export let activeRequests = 0;
export let activeTextRequests = 0;
export let activeMediaRequests = 0;

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

/** True when the author's user ID is in the AI_SKIP_ANALYSIS_USER_IDS set. */
export function isSkipAnalysisUser(message: MessageRecord): boolean {
  return AI_SKIP_ANALYSIS_USER_IDS.has(message.user_id);
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

/** Skip-result for authors in the AI_SKIP_ANALYSIS_USER_IDS set (music bots). */
export function buildSkipAnalysisUserResult(): {
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
    flags: JSON.stringify(["skip_analysis_user"]),
    score: 0,
    analysis: "Skipped moderation for bot author (configured skip list).",
    categories: ["skip_analysis_user"],
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

/** Filter out messages from AI_SKIP_ANALYSIS_USER_IDS authors (no LLM call). */
export async function skipAnalysisUserMessages(
  messages: MessageRecord[],
): Promise<MessageRecord[]> {
  const skipUsers = messages.filter(isSkipAnalysisUser);
  if (skipUsers.length === 0) {
    return messages;
  }

  const skippedRows = await messageStore.updateMessagesAIAnalysisBulk(
    skipUsers.map((message) => ({
      messageId: message.id,
      result: buildSkipAnalysisUserResult(),
    })),
  );

  for (const row of skippedRows) {
    broadcastAnalysisCompleted(row);
  }

  const skippedIds = new Set(skipUsers.map((message) => message.id));
  return messages.filter((message) => !skippedIds.has(message.id));
}

// ---------------------------------------------------------------------------
// Batch pipeline
// ---------------------------------------------------------------------------

/**
 * Runs ONE worker job for a single lane (text-only or media sub-batch of a
 * conversation) end-to-end: dispatch → broadcast/save → fallback routing.
 *
 * The lock for this conversation+lane is RELEASED here as soon as THIS lane's
 * worker job resolves — never after waiting on the other lane. That's the
 * core fix for "text menunggu image": previously one conversation batch made
 * ONE worker call with both text and media targets, and processing finished
 * only once BOTH lanes completed, so a fast text verdict sat unused until the
 * slow vision/image verdict was ready. Now each lane's results save+broadcast
 * the moment ITS job finishes, and the conversation lock for that lane is
 * freed independently.
 *
 * Returns whether the *caller* should schedule the next debounce pass for
 * this conversation's LANE.
 */
async function runQueueBatch(
  pool: typeof textWorkerPool,
  conversationKey: string,
  lane: AnalysisLane,
  messages: MessageRecord[],
): Promise<boolean> {
  activeRequests++;
  if (lane === "media") activeMediaRequests++;
  else activeTextRequests++;

  try {
    const result = (await pool.run({
      type: "batch",
      conversationKey,
      lane,
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
      recordConversationBatchFailure(conversationKey, lane);

      // Batch failed entirely -- fall back all messages to individual queue
      logger.warn(
        {
          conversationKey,
          lane,
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
          lane,
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
      return false;
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
          lane,
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
          lane,
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
      recordConversationBatchFailure(conversationKey, lane);
      const existingCooldown =
        conversationErrorCooldown.get(conversationKey) ?? 0;
      const newCooldown = Date.now() + config.AI_ANALYSIS_ERROR_COOLDOWN_MS;
      if (newCooldown > existingCooldown) {
        conversationErrorCooldown.set(conversationKey, newCooldown);
      }

      // Do NOT schedule next -- let the cooldown gate it
      return false;
    }

    resetConversationBatchFailures(conversationKey, lane);
    conversationErrorCooldown.delete(conversationKey);
    return true;
  } catch (error) {
    recordConversationBatchFailure(conversationKey, lane);

    logger.warn(
      { conversationKey, lane, messageCount: messages.length },
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
        lane,
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
    return false;
  } finally {
    activeRequests--;
    if (lane === "media") activeMediaRequests--;
    else activeTextRequests--;
  }
}

export async function processBatch(
  conversationKey: string,
  lane: AnalysisLane,
  messages: MessageRecord[],
  processingStartedAt: number,
): Promise<void> {
  // Release this lane's lock immediately when there's nothing to do. The
  // messages array was already labelled with the lane it belongs to by the
  // scheduler (which fetched them from the DB), so an empty array means this
  // lane has no work — free it so the debounce can re-arm right away.
  if (messages.length === 0) {
    if (
      getConversationProcessingStartedAt(conversationKey, lane) ===
      processingStartedAt
    ) {
      clearConversationProcessing(conversationKey, lane);
    }
    return;
  }
  const cooldownUntil = conversationErrorCooldown.get(conversationKey) ?? 0;
  if (Date.now() < cooldownUntil) {
    if (
      getConversationProcessingStartedAt(conversationKey, lane) ===
      processingStartedAt
    ) {
      clearConversationProcessing(conversationKey, lane);
    }
    return;
  }

  const result = await runQueueBatch(
    lane === "media" ? mediaWorkerPool : textWorkerPool,
    conversationKey,
    lane,
    messages,
  );

  // Release THIS lane's lock now — the other lane (if any) is dispatched
  // separately by the scheduler and owns its own lock. The old code awaited
  // BOTH lanes (Promise.allSettled) before releasing the single conversation
  // lock, so the text sub-batch of a conversation blocked its own lock until
  // the slow media sub-batch finished. Now each lane is independent: the text
  // lane frees its lock and re-schedules the moment the text worker returns.
  if (
    getConversationProcessingStartedAt(conversationKey, lane) ===
    processingStartedAt
  ) {
    clearConversationProcessing(conversationKey, lane);
  }

  if (result) {
    setImmediate(() => {
      // Dynamic import to avoid circular dependency at module scope.
      // Re-schedule ONLY this lane — the other lane schedules itself.
      import("./batchScheduler.js").then((m) =>
        m.scheduleConversationAnalysis(conversationKey, lane),
      );
    });
  }
}
