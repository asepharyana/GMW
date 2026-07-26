import { createChildLogger } from "@bete/shared/logger";
import type { Client } from "discord.js-selfbot-v13";
import { config } from "../../shared/config/config.js";
import type { EventBroadcaster } from "../event-broadcaster/index.js";
import {
  getConversationKeysWithIncompleteAnalysis,
  getIncompleteMessagesByConversation,
  getMessageById,
  getPendingConversationKeys,
  revertStuckProcessingMessages,
  updateMessageAIAnalysis,
} from "../message-capture/messageStore.js";
import type { AnalysisQueueStatus } from "../message-capture/types.js";
import {
  activeRequests,
  buildAgeRestrictedSkipResult,
  isAgeRestrictedMessage,
  skipAgeRestrictedMessages,
} from "./batchProcessor.js";
import { scheduleConversationAnalysis } from "./batchScheduler.js";
import {
  broadcastAnalysisCompleted,
  conversationConsecutiveErrors,
  conversationDebounceTimers,
  conversationErrorCooldown,
  conversationProcessing,
  getConversationKey,
  isConversationProcessingLocked,
  LAST_ERROR,
  setModerationClient,
  setSharedEventBroadcaster,
} from "./circuitBreaker.js";
import {
  activeIndividualRequests,
  enqueueIndividualFallbacks,
  individualCooldownUntil,
  individualInFlight,
  individualInFlightByConversation,
  individualInFlightLastTouched,
} from "./individualFallbackProcessor.js";

const logger = createChildLogger("ai-analyzer");

// ---------------------------------------------------------------------------
// Re-exports from sub-modules (preserving original public API)
// ---------------------------------------------------------------------------

export { pickBatchWithinBudget } from "./batchProcessor.js";
export { getConversationKey, onCircuitBreakerAlert } from "./circuitBreaker.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Queues a message for analysis (debounced by conversation).
 */
export async function queueMessageAnalysis(messageId: string): Promise<void> {
  if (!config.AI_ANALYSIS_ENABLED) return;

  try {
    const message = await getMessageById(messageId);
    if (!message) {
      logger.warn({ messageId }, "Message not found for analysis queue");
      return;
    }

    if (isAgeRestrictedMessage(message)) {
      const updated = await updateMessageAIAnalysis(
        message.id,
        buildAgeRestrictedSkipResult(),
      );
      if (updated) {
        broadcastAnalysisCompleted(updated);
      }
      logger.debug(
        { messageId },
        "Skipped AI analysis for age-restricted message",
      );
      return;
    }

    queueConversationAnalysis(getConversationKey(message));
  } catch (error) {
    logger.error(
      {
        messageId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to queue message for analysis",
    );
  }
}

/**
 * Queues a conversation for analysis (debounced).
 */
export function queueConversationAnalysis(conversationKey: string): void {
  if (!config.AI_ANALYSIS_ENABLED) return;
  scheduleConversationAnalysis(conversationKey);
}

/**
 * Returns current status of both the batch and individual fallback queues.
 */
export function getAnalysisQueueStatus(): AnalysisQueueStatus {
  return {
    queuedConversations: conversationDebounceTimers.size,
    activeRequests,
    activeIndividualRequests,
    individualInFlightCount: individualInFlight.size,
    individualCircuitBreakerActive: Date.now() < individualCooldownUntil,
    lastError: LAST_ERROR.value,
  };
}

/**
 * Starts the periodic recovery worker.
 *
 * FIX #4: Now also recovers messages stuck in `error/analysis_incomplete`
 * state (not just `pending`), and skips conversations that already have
 * individual fallback work in progress to avoid DB last-write-wins races.
 */
export function startPendingAIAnalysisWorker(
  client?: Client,
  eventBroadcaster?: EventBroadcaster,
): void {
  setModerationClient(client);
  setSharedEventBroadcaster(eventBroadcaster);
  if (!config.AI_ANALYSIS_ENABLED) return;

  import("./cultureLearner.js")
    .then((m) => m.startCultureLearnerWorker())
    .catch(console.error);
  import("./userProfileLearner.js")
    .then((m) => m.startUserProfileLearnerWorker())
    .catch(console.error);

  setInterval(() => {
    revertStuckProcessingMessages(300000).catch((err: unknown) => {
      logger.error(
        { error: String(err) },
        "Failed to run stuck processing recovery",
      );
    });

    // FIX #3 pattern: no async arrow -- chain promises explicitly.
    Promise.all([
      getPendingConversationKeys(500),
      getConversationKeysWithIncompleteAnalysis(200),
    ])
      .then(([pendingKeys, incompleteKeys]) => {
        const now = Date.now();

        // FIX #9: Prune stale entries from state maps to prevent unbounded
        // memory growth from channels/threads that are no longer active.
        for (const [key, expiry] of conversationErrorCooldown) {
          if (now >= expiry) conversationErrorCooldown.delete(key);
        }
        for (const [key, startedAt] of conversationProcessing) {
          if (now - startedAt >= config.AI_ANALYSIS_PROCESSING_TIMEOUT_MS) {
            conversationProcessing.delete(key);
          }
        }

        // FIX #7: Prune stale in-flight counters for conversations that have
        // been idle longer than the processing timeout -- prevents permanent
        // blocking if a decrement was missed due to an uncaught exception.
        const staleThreshold = config.AI_ANALYSIS_PROCESSING_TIMEOUT_MS * 2;
        for (const [key, lastTouched] of individualInFlightLastTouched) {
          if (now - lastTouched >= staleThreshold) {
            individualInFlightLastTouched.delete(key);
            individualInFlightByConversation.delete(key);
            logger.warn(
              { key },
              "Pruned stale individualInFlightByConversation entry",
            );
          }
        }

        // Also prune stale per-conversation CB error counts that have cooled
        // down so old conversations can be retried.
        for (const [key] of conversationConsecutiveErrors) {
          const cbExpire = conversationErrorCooldown.get(key) ?? 0;
          if (cbExpire && now >= cbExpire) {
            conversationConsecutiveErrors.delete(key);
          }
        }

        // FIX #8: Build a set of keys already targeted for individual recovery
        // so the batch loop below skips them.
        const incompleteKeySet = new Set(incompleteKeys);

        // --- Batch recovery for pending messages ---
        for (const key of pendingKeys) {
          if (conversationDebounceTimers.has(key)) continue;
          if (isConversationProcessingLocked(key)) continue;
          // FIX #4: skip if individual fallback already running for this conversation.
          if (individualInFlightByConversation.has(key)) continue;
          // FIX #8: skip if this conversation also needs individual recovery.
          if (incompleteKeySet.has(key)) continue;
          const cooldownUntil = conversationErrorCooldown.get(key);
          if (cooldownUntil && now < cooldownUntil) continue;
          scheduleConversationAnalysis(key);
        }

        // --- Individual recovery for error/analysis_incomplete messages ---
        // Circuit breaker check: no point iterating if individual CB is active.
        if (now >= individualCooldownUntil) {
          const promises: Promise<void>[] = [];
          for (const key of incompleteKeys) {
            // Skip if individual work is already running for this conversation.
            if (individualInFlightByConversation.has(key)) continue;
            // Skip if batch processing is running.
            if (isConversationProcessingLocked(key)) continue;

            promises.push(
              getIncompleteMessagesByConversation(key, 500)
                .then(async (msgs) => {
                  const processableMessages =
                    await skipAgeRestrictedMessages(msgs);
                  return processableMessages;
                })
                .then((msgs) => {
                  if (msgs.length > 0) {
                    enqueueIndividualFallbacks(msgs);
                  }
                })
                .catch((err: unknown) => {
                  logger.error(
                    { key, error: String(err) },
                    "Failed to fetch incomplete messages for recovery",
                  );
                }),
            );
          }
          // Errors are handled per-key; return the combined promise for observability.
          return Promise.all(promises);
        }
      })
      .catch((err: unknown) => {
        logger.error(
          { error: err instanceof Error ? err.message : String(err) },
          "Pending AI analysis recovery worker failed",
        );
      });
  }, config.AI_ANALYSIS_RECOVERY_INTERVAL_MS);
}
