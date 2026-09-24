import { LRUCache } from "lru-cache";
import { createChildLogger } from "@/shared/logger/index";
import { config } from "../../shared/config/index.js";
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
 * ## Processing lanes (2026-09-24)
 * A conversation batch splits into a **text lane** (messages with no media)
 * and a **media lane** (messages with attachments/stickers/embeds). The two
 * lanes are dispatched to separate Piscina pools and MUST NOT block each
 * other: a fast text sub-batch must be free to finish while the slow
 * vision/media sub-batch of the SAME conversation is still running.
 *
 * The lock is therefore per-lane: `conversationProcessing` maps a
 * conversation key to its current processing record which carries the lane
 * name. `isConversationProcessingLocked(key, lane)` reports locked only when
 * the SAME lane (or all lanes when lane is omitted) is active — a media
 * sub-batch in flight never blocks scheduling the text sub-batch.
 *
 * ## Relationship with moderationState.ts
 * - `moderationState.ts` owns **infrastructure references** (event broadcaster,
 *   Discord client), the auto-delete guard, the `LAST_ERROR` tracker, and
 *   action helpers (`broadcastAnalysisCompleted`, `scheduleAutoDelete`).
 * - The only cross-module dependency is this file importing `LAST_ERROR` from
 *   `moderationState.ts` to include the latest pipeline error in alerts.
 * - These are **separate concerns** — do not merge them.
 */

/** Processing lanes for conversation analysis. */
export type AnalysisLane = "text" | "media";

export const ANALYSIS_LANES: readonly AnalysisLane[] = [
  "text",
  "media",
] as const;

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

/**
 * Per-conversation processing lock, keyed by lane.
 *
 * A conversation can hold TWO locks at once — one for its text sub-batch and
 * one for its media sub-batch — because the two lanes run on separate pools
 * and finish independently. The value is a partial record of lane →
 * startedAt; clearing one lane leaves the other lane's lock intact.
 */
export const conversationProcessing = new LRUCache<
  string,
  Partial<Record<AnalysisLane, number>>
>({ max: 10000 });

/**
 * Locks a conversation for the given lane.
 * The same conversation can be locked in both lanes simultaneously (text and
 * media sub-batches run independently); locking an already-locked lane
 * replaces its startedAt (last writer wins, matching the old single-lock
 * semantics).
 */
export function setConversationProcessing(
  conversationKey: string,
  lane: AnalysisLane,
  startedAt: number,
): void {
  const record = conversationProcessing.get(conversationKey) ?? {};
  conversationProcessing.set(conversationKey, { ...record, [lane]: startedAt });
}

/**
 * Releases the processing lock for a conversation in a SINGLE lane.
 * The other lane's lock (if any) is preserved.
 */
export function clearConversationProcessing(
  conversationKey: string,
  lane: AnalysisLane,
): void {
  const record = conversationProcessing.get(conversationKey);
  if (!record) return;
  const next = { ...record };
  delete next[lane];
  if (Object.keys(next).length === 0) {
    conversationProcessing.delete(conversationKey);
  } else {
    conversationProcessing.set(conversationKey, next);
  }
}

/**
 * Clears the processing lock for a conversation regardless of lane.
 * Used by the recovery worker when a lock is stale. If only ONE lane of a
 * two-lane processing conversation is stale, prefer clearConversationProcessing
 * with the specific lane to keep the healthy lane's lock intact.
 */
export function clearConversationProcessingAll(conversationKey: string): void {
  conversationProcessing.delete(conversationKey);
}

/**
 * Returns the startedAt for a conversation in a lane, or undefined.
 * Consumers use this to verify a processing slot is still owned by them
 * before releasing it (guards against clearing a newer slot).
 */
export function getConversationProcessingStartedAt(
  conversationKey: string,
  lane: AnalysisLane,
): number | undefined {
  return conversationProcessing.get(conversationKey)?.[lane];
}

// ---------------------------------------------------------------------------
// Conversation lock helper
// ---------------------------------------------------------------------------

/**
 * Reports whether the conversation is currently processing.
 *
 * When `lane` is provided, only that lane's lock counts — a media sub-batch
 * in flight does NOT lock the text lane, so the text lane can be scheduled
 * and vice versa. When `lane` is omitted, any active lane locks it (used by
 * recovery/individual fallback which must not race ANY batch work).
 */
export function isConversationProcessingLocked(
  conversationKey: string,
  lane?: AnalysisLane,
): boolean {
  const now = Date.now();
  if (lane) {
    const startedAt = conversationProcessing.get(conversationKey)?.[lane];
    return Boolean(
      startedAt && now - startedAt < config.AI_ANALYSIS_PROCESSING_TIMEOUT_MS,
    );
  }
  const record = conversationProcessing.get(conversationKey);
  if (!record) return false;
  return ANALYSIS_LANES.some((l) => {
    const s = record[l];
    return Boolean(s && now - s < config.AI_ANALYSIS_PROCESSING_TIMEOUT_MS);
  });
}

// ---------------------------------------------------------------------------
// Alert system
// ---------------------------------------------------------------------------

export type CircuitBreakerAlert = {
  type: "conversation_cb" | "individual_cb" | "sustained_error";
  conversationKey?: string;
  lane?: AnalysisLane;
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

export function recordConversationBatchFailure(
  conversationKey: string,
  lane?: AnalysisLane,
): void {
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
      lane,
      consecutiveErrors: nextCount,
      message: `Conversation ${conversationKey} circuit breaker triggered after ${nextCount} consecutive errors`,
      lastError: LAST_ERROR.value,
    });
    conversationConsecutiveErrors.set(conversationKey, 0);
  }
}

export function resetConversationBatchFailures(
  conversationKey: string,
  _lane?: AnalysisLane,
): void {
  conversationConsecutiveErrors.delete(conversationKey);
}
