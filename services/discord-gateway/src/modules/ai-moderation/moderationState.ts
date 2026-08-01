import type { Client } from "discord.js-selfbot-v13";
import { LRUCache } from "lru-cache";
import { createChildLogger } from "@/shared/logger/index";
import { config } from "../../shared/config/config.js";
import type { EventBroadcaster } from "../event-broadcaster/index.js";
import type { MessageRecord } from "../message-capture/types.js";
import { attemptAutoDeleteFlaggedMessage } from "./autoDeleteManager.js";

/**
 * # Boundary: Infrastructure state & pipeline-wide helpers
 *
 * This module owns state that is **infrastructural** (references to the Discord
 * client and Redis event broadcaster, injected externally at startup) and
 * **action helpers** that the analysis pipeline calls after a message has been
 * processed (broadcasting analysis-completed events and scheduling auto-delete
 * side-effects).
 *
 * ## What lives here
 * - `_redisEventBroadcaster` / `setSharedEventBroadcaster()` — injected Redis
 *   publisher for broadcasting `message_analyzed` events.
 * - `moderationClient` / `setModerationClient()` — injected Discord client
 *   reference, needed by the auto-delete flow.
 * - `autoDeleteInFlight` — LRU-based in-flight guard to prevent duplicate
 *   auto-delete attempts on the same message.
 * - `LAST_ERROR` — generic pipeline-wide error tracker used in alert details
 *   (consumed by `conversationState.ts` for circuit-breaker alerts).
 * - `broadcastAnalysisCompleted()` — publishes the analysis result to Redis.
 * - `scheduleAutoDelete()` — dispatches delayed auto-delete if the message
 *   was flagged/warned.
 *
 * ## Relationship with conversationState.ts
 * - `conversationState.ts` owns **per-conversation** state: circuit breakers,
 *   debounce timers, processing locks, and an alert system.
 * - The only cross-module dependency is `conversationState.ts` importing
 *   `LAST_ERROR` from here to enrich circuit-breaker alerts.
 * - These are **separate concerns** — do not merge them.
 */

const logger = createChildLogger("moderation-state");

// ---------------------------------------------------------------------------
// Shared observable state
// ---------------------------------------------------------------------------

/** Redis EventBroadcaster -- set externally so sub-modules can publish events. */
export let _redisEventBroadcaster: EventBroadcaster | undefined;

/** Discord client reference -- needed for auto-delete actions. */
export let moderationClient: Client | undefined;

export function setSharedEventBroadcaster(
  eb: EventBroadcaster | undefined,
): void {
  _redisEventBroadcaster = eb;
}

export function setModerationClient(mc: Client | undefined): void {
  moderationClient = mc;
}

/**
 * Per-message in-flight guard for the auto-delete side-effect.
 * (LRU-backed to prevent unbounded growth)
 */
export const autoDeleteInFlight = new LRUCache<string, true>({ max: 10000 });

/** Last recorded error across all pipelines. */
export const LAST_ERROR: { value: string | null } = { value: null };

// ---------------------------------------------------------------------------
// Broadcast & auto-delete helpers
// ---------------------------------------------------------------------------

export function broadcastAnalysisCompleted(row: MessageRecord): void {
  if (_redisEventBroadcaster) {
    _redisEventBroadcaster.messageAnalyzed(row).catch((err: unknown) =>
      logger.warn(
        {
          messageId: row.id,
          error: err instanceof Error ? err.message : String(err),
        },
        "Failed to publish message_analyzed via Redis EventBroadcaster",
      ),
    );
  }
}

export function scheduleAutoDelete(row: MessageRecord): void {
  if (row.ai_status !== "flagged" && row.ai_status !== "warn") return;

  if (autoDeleteInFlight.has(row.id)) {
    logger.debug(
      { messageId: row.id },
      "Auto-delete skipped: already in-flight for this message",
    );
    return;
  }
  autoDeleteInFlight.set(row.id, true);

  const run = () => {
    attemptAutoDeleteFlaggedMessage(moderationClient, row)
      .catch((error: unknown) => {
        logger.error(
          {
            messageId: row.id,
            error: error instanceof Error ? error.message : String(error),
          },
          "Unexpected auto-delete error",
        );
      })
      .finally(() => {
        autoDeleteInFlight.delete(row.id);
      });
  };

  if (config.AUTO_DELETE_FLAGGED_DELAY_MS > 0) {
    setTimeout(run, config.AUTO_DELETE_FLAGGED_DELAY_MS);
    return;
  }
  setImmediate(run);
}
