import { existsSync } from "node:fs";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { createChildLogger } from "@bete/shared/logger";
import type { Client } from "discord.js-selfbot-v13";
import { LRUCache } from "lru-cache";
import { Piscina } from "piscina";
import { config } from "../../shared/config/config.js";
import type { EventBroadcaster } from "../event-broadcaster/index.js";
import type { MessageRecord } from "../message-capture/types.js";
import { attemptAutoDeleteFlaggedMessage } from "./autoDeleteManager.js";

const logger = createChildLogger("circuit-breaker");

// ---------------------------------------------------------------------------
// Piscina worker pool (shared by batch + individual pipelines)
// ---------------------------------------------------------------------------

function getAnalysisWorkerUrl(): URL {
  const candidates = [
    new URL("./aiAnalysisWorker.js", import.meta.url),
    new URL("../aiAnalysisWorker.js", import.meta.url),
    new URL("./aiAnalysisWorker.ts", import.meta.url),
  ];

  for (const candidate of candidates) {
    if (existsSync(fileURLToPath(candidate))) {
      return candidate;
    }
  }

  return candidates[2];
}

export const workerPool = new Piscina({
  filename: fileURLToPath(getAnalysisWorkerUrl()),
  execArgv: process.execArgv,
  maxThreads: config.PISCINA_MAX_THREADS ?? availableParallelism(),
});

/**
 * Gets the conversation key for a message (thread_id or channel_id).
 */
export function getConversationKey(message: MessageRecord): string {
  return message.thread_id || message.channel_id;
}

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
// Batch circuit breaker state
// ---------------------------------------------------------------------------

export const conversationConsecutiveErrors = new LRUCache<string, number>({
  max: 10000,
});
export const MAX_CONSECUTIVE_ERRORS = 5;
export const CONVERSATION_CB_COOLDOWN_MS = 60000;
export const conversationErrorCooldown = new LRUCache<string, number>({
  max: 10000,
});

// ---------------------------------------------------------------------------
// Scheduling / timing state (shared so sub-modules can access without cycles)
// ---------------------------------------------------------------------------

/** Debounce timer handle per conversation key. */
export const conversationDebounceTimers = new LRUCache<string, NodeJS.Timeout>({
  max: 10000,
  dispose: (value) => {
    clearTimeout(value);
  },
});

/** Timestamp of when processing started per conversation key. */
export const conversationProcessing = new LRUCache<string, number>({
  max: 10000,
});

// ---------------------------------------------------------------------------
// Conversation lock helper
// ---------------------------------------------------------------------------

export function isConversationProcessingLocked(
  conversationKey: string,
): boolean {
  const startedAt = conversationProcessing.get(conversationKey);
  return Boolean(
    startedAt &&
      Date.now() - startedAt < config.AI_ANALYSIS_PROCESSING_TIMEOUT_MS,
  );
}

// ---------------------------------------------------------------------------
// Alert system
// ---------------------------------------------------------------------------

export type CircuitBreakerAlert = {
  type: "conversation_cb" | "individual_cb" | "sustained_error";
  conversationKey?: string;
  consecutiveErrors: number;
  message: string;
  lastError?: string | null;
};

const alertHandlers: Array<(alert: CircuitBreakerAlert) => void> = [];

/**
 * Register an alert handler (e.g., for webhook integration).
 */
export function onCircuitBreakerAlert(
  handler: (alert: CircuitBreakerAlert) => void,
): void {
  alertHandlers.push(handler);
}

export function fireAlert(alert: CircuitBreakerAlert): void {
  logger.warn(alert, `CB Alert: ${alert.type} -- ${alert.message}`);
  for (const handler of alertHandlers) {
    try {
      handler(alert);
    } catch {
      // handler errors are non-critical
    }
  }
}

// ---------------------------------------------------------------------------
// Circuit breaker helpers
// ---------------------------------------------------------------------------

export function recordConversationBatchFailure(conversationKey: string): void {
  const nextCount =
    (conversationConsecutiveErrors.get(conversationKey) ?? 0) + 1;
  conversationConsecutiveErrors.set(conversationKey, nextCount);

  if (nextCount >= MAX_CONSECUTIVE_ERRORS) {
    conversationErrorCooldown.set(
      conversationKey,
      Date.now() + CONVERSATION_CB_COOLDOWN_MS,
    );
    fireAlert({
      type: "conversation_cb",
      conversationKey,
      consecutiveErrors: nextCount,
      message: `Conversation ${conversationKey} circuit breaker triggered after ${nextCount} consecutive errors`,
      lastError: LAST_ERROR.value,
    });
    conversationConsecutiveErrors.set(conversationKey, 0);
  }
}

export function resetConversationBatchFailures(conversationKey: string): void {
  conversationConsecutiveErrors.delete(conversationKey);
}

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
