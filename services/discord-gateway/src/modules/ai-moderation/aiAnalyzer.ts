import type { Client } from "discord.js-selfbot-v13";
import { createChildLogger } from "@/shared/logger/index";
import { config } from "../../shared/config/config.js";
import type { EventBroadcaster } from "../event-broadcaster/index.js";
import { messageStore } from "../message-capture/messageStore.js";
import type { AnalysisQueueStatus } from "../message-capture/types.js";
import {
  activeRequests,
  buildAgeRestrictedSkipResult,
  isAgeRestrictedMessage,
  skipAgeRestrictedMessages,
} from "./batchProcessor.js";
import { scheduleConversationAnalysis } from "./batchScheduler.js";
import { getConversationKey } from "./circuitBreaker.js";
import {
  conversationConsecutiveErrors,
  conversationDebounceTimers,
  conversationErrorCooldown,
  conversationProcessing,
  isConversationProcessingLocked,
} from "./conversationState.js";
import {
  activeIndividualRequests,
  enqueueIndividualFallbacks,
  individualCooldownUntil,
  individualInFlight,
  individualInFlightByConversation,
  individualInFlightLastTouched,
} from "./individualFallbackProcessor.js";
import {
  broadcastAnalysisCompleted,
  LAST_ERROR,
  setModerationClient,
  setSharedEventBroadcaster,
} from "./moderationState.js";
import { deleteExpiredQdrantPoints } from "./qdrantClient.js";
import { pruneExpiredTexts } from "./textCacheStore.js";

const logger = createChildLogger("ai-analyzer");

// ---------------------------------------------------------------------------
// Cache hygiene (expired verdict sweep)
// ---------------------------------------------------------------------------
const CACHE_PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
let lastCachePruneAt = 0;

// ---------------------------------------------------------------------------
// Re-exports from sub-modules (preserving original public API)
// ---------------------------------------------------------------------------

export { pickBatchWithinBudget } from "./batchProcessor.js";
export { getConversationKey } from "./circuitBreaker.js";
export { onCircuitBreakerAlert } from "./conversationState.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Queues a message for analysis (debounced by conversation).
 */
export async function queueMessageAnalysis(messageId: string): Promise<void> {
  if (!config.AI_ANALYSIS_ENABLED) return;

  try {
    const message = await messageStore.getMessageById(messageId);
    if (!message) {
      logger.warn({ messageId }, "Message not found for analysis queue");
      return;
    }

    if (isAgeRestrictedMessage(message)) {
      const updated = await messageStore.updateMessageAIAnalysis(
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
 * Now also recovers messages stuck in `error/analysis_incomplete`
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
  if (config.AI_USER_PROFILE_LEARNING_ENABLED) {
    import("./userProfileLearner.js")
      .then((m) => m.startUserProfileLearnerWorker())
      .catch(console.error);
  }

  setInterval(() => {
    // [D] Periodic cache hygiene: purge expired moderation verdicts from
    // Postgres and Qdrant. Expired entries are never reused (filters check
    // expires_at) but accumulate forever without this sweep.
    const now = Date.now();
    if (now - lastCachePruneAt >= CACHE_PRUNE_INTERVAL_MS) {
      lastCachePruneAt = now;
      Promise.all([pruneExpiredTexts(), deleteExpiredQdrantPoints()])
        .then(([pgDeleted, qdDeleted]) => {
          if (pgDeleted > 0 || qdDeleted > 0) {
            logger.info(
              { pgDeleted, qdDeleted },
              "Expired moderation cache pruned",
            );
          }
        })
        .catch((err: unknown) => {
          logger.warn({ error: String(err) }, "Moderation cache prune failed");
        });
    }

    messageStore.revertStuckProcessingMessages(300000).catch((err: unknown) => {
      logger.error(
        { error: String(err) },
        "Failed to run stuck processing recovery",
      );
    });

    Promise.all([
      messageStore.getPendingConversationKeys(500),
      messageStore.getConversationKeysWithIncompleteAnalysis(200),
    ])
      .then(([pendingKeys, incompleteKeys]) => {
        const now = Date.now();

        for (const [key, expiry] of conversationErrorCooldown) {
          if (now >= expiry) conversationErrorCooldown.delete(key);
        }
        for (const [key, startedAt] of conversationProcessing) {
          if (now - startedAt >= config.AI_ANALYSIS_PROCESSING_TIMEOUT_MS) {
            conversationProcessing.delete(key);
          }
        }

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

        const incompleteKeySet = new Set(incompleteKeys);

        // --- Batch recovery for pending messages ---
        for (const key of pendingKeys) {
          if (conversationDebounceTimers.has(key)) continue;
          if (isConversationProcessingLocked(key)) continue;
          if (individualInFlightByConversation.has(key)) continue;
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
              messageStore
                .getIncompleteMessagesByConversation(key, 500)
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
