import { createChildLogger } from "@/shared/logger/index";
import { config } from "../../shared/config/index.js";
import { messageStore } from "../message-capture/messageStore.js";
import {
  skipAgeRestrictedMessages,
  skipAnalysisUserMessages,
} from "./batchProcessor.js";
import { scheduleConversationAnalysis } from "./batchScheduler.js";
import { runCachePruneIfDue } from "./cache-prune.js";
import {
  ANALYSIS_LANES,
  type AnalysisLane,
  clearConversationProcessing,
  conversationConsecutiveErrors,
  conversationDebounceTimers,
  conversationErrorCooldown,
  conversationProcessing,
  isConversationProcessingLocked,
} from "./conversationState.js";
import {
  enqueueIndividualFallbacks,
  individualCooldownUntil,
  individualInFlightByConversation,
  individualInFlightLastTouched,
} from "./individualFallbackProcessor.js";

const logger = createChildLogger("ai-recovery");

/** Revert messages stuck in `processing` for longer than this. */
const STUCK_PROCESSING_AGE_MS = 300_000;

/**
 * Starts the periodic recovery worker.
 *
 * Recovers two classes of stranded work:
 *  - `pending` messages → re-scheduled through the normal per-lane debounce.
 *  - `error` / `analysis_incomplete` messages → individual fallback queue.
 *
 * Also prunes stale in-memory bookkeeping (lane locks, per-conversation
 * circuit-breaker counters, individual-fallback in-flight markers) so a
 * crashed batch cannot wedge a conversation forever, and triggers the
 * throttled cache-prune sweep.
 *
 * Skips conversations that already have individual fallback work in progress
 * to avoid DB last-write-wins races.
 */
export function startRecoveryWorker(): void {
  setInterval(() => {
    runCachePruneIfDue();

    // Only revert stuck processing messages if there's active processing.
    // Avoids a DB query every recovery interval when the pipeline is idle.
    if (conversationProcessing.size > 0) {
      messageStore
        .revertStuckProcessingMessages(STUCK_PROCESSING_AGE_MS)
        .catch((err: unknown) => {
          logger.error(
            { error: String(err) },
            "Failed to run stuck processing recovery",
          );
        });
    }

    Promise.all([
      messageStore.getPendingConversationKeys(500),
      messageStore.getConversationKeysWithIncompleteAnalysis(200),
    ])
      .then(([pendingKeys, incompleteKeys]) => {
        const now = Date.now();

        pruneStaleConversationState(now);

        const incompleteKeySet = new Set(incompleteKeys);

        // --- Batch recovery for pending messages ---
        for (const key of pendingKeys) {
          if (
            ANALYSIS_LANES.some((lane) =>
              conversationDebounceTimers.has(`${key}::${lane}`),
            )
          ) {
            continue;
          }
          // Batch recovery must not race ANY in-flight batch lane, so the
          // lock check is lane-agnostic here (individual fallback handles
          // error rows separately).
          if (isConversationProcessingLocked(key)) continue;
          if (individualInFlightByConversation.has(key)) continue;
          if (incompleteKeySet.has(key)) continue;
          const cooldownUntil = conversationErrorCooldown.get(key);
          if (cooldownUntil && now < cooldownUntil) continue;
          // No lane specified → schedule BOTH lanes; each fetches its own
          // pending subset from the DB.
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
              recoverIncompleteConversation(key).catch((err: unknown) => {
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

/** Fetch one conversation's incomplete messages and queue them individually. */
async function recoverIncompleteConversation(key: string): Promise<void> {
  const msgs = await messageStore.getIncompleteMessagesByConversation(key, 500);
  const processable = await skipAnalysisUserMessages(
    await skipAgeRestrictedMessages(msgs),
  );
  if (processable.length > 0) {
    enqueueIndividualFallbacks(processable);
  }
}

/**
 * Drop stale in-memory bookkeeping:
 *  - per-lane processing locks past the timeout (pruned PER LANE so one stale
 *    lane never clears the other lane's healthy lock),
 *  - individual-fallback in-flight markers that stopped being touched,
 *  - per-conversation circuit-breaker error counts whose cooldown has lapsed.
 */
function pruneStaleConversationState(now: number): void {
  for (const [key, expiry] of conversationErrorCooldown) {
    if (now >= expiry) conversationErrorCooldown.delete(key);
  }

  for (const [key, record] of conversationProcessing) {
    for (const lane of ANALYSIS_LANES as readonly AnalysisLane[]) {
      const startedAt = record?.[lane];
      if (
        startedAt &&
        now - startedAt >= config.AI_ANALYSIS_PROCESSING_TIMEOUT_MS
      ) {
        clearConversationProcessing(key, lane);
      }
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
}
