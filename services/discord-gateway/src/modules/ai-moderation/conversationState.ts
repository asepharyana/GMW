import { LRUCache } from "lru-cache";
import { createChildLogger } from "@/shared/logger/index";
import { config } from "../../shared/config/config.js";
import { LAST_ERROR } from "./moderationState.js";

/**
 * # Boundary: Per-conversation batching, circuit breakers & alerts
 *
 * This module owns **per-conversation** state for the AI analysis batching
 * pipeline: circuit-breaker error tracking, debounce timers, and processing
 * locks that prevent duplicate concurrent analysis of the same conversation.
 *
 * ## What lives here
 * - `conversationConsecutiveErrors` — circuit-breaker: consecutive error count
 *   per conversation key.
 * - `conversationErrorCooldown` — circuit-breaker: timestamp at which the
 *   cooldown expires (cooldown = 60s of no batch scheduling after 5 errors).
 * - `conversationDebounceTimers` — scheduling: active `setTimeout` handles so
 *   pending batches can be cancelled/rescheduled.
 * - `conversationProcessing` — lock: `Date.now()` when processing started, used
 *   by `isConversationProcessingLocked()` to detect stale processing slots.
 * - `recordConversationBatchFailure()` / `resetConversationBatchFailures()` —
 *   circuit-breaker mutation helpers.
 * - Alert system: `CircuitBreakerAlert` type, `fireAlert()`, and
 *   `onCircuitBreakerAlert()` for pluggable handler registration.
 *
 * ## Relationship with moderationState.ts
 * - `moderationState.ts` owns **infrastructure references** (event broadcaster,
 *   Discord client), the auto-delete guard, the `LAST_ERROR` tracker, and
 *   action helpers (`broadcastAnalysisCompleted`, `scheduleAutoDelete`).
 * - The only cross-module dependency is this file importing `LAST_ERROR` from
 *   `moderationState.ts` to include the latest pipeline error in alerts.
 * - These are **separate concerns** — do not merge them.
 */

const logger = createChildLogger("conversation-state");

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
