import { createChildLogger } from "@bete/shared/logger";
import { config } from "../../shared/config/config.js";
import { getPendingMessagesByConversation } from "../message-capture/messageStore.js";
import type { MessageRecord } from "../message-capture/types.js";
import {
  pickBatchWithinBudget,
  processBatch,
  skipAgeRestrictedMessages,
} from "./batchProcessor.js";
import {
  conversationConsecutiveErrors,
  conversationDebounceTimers,
  conversationErrorCooldown,
  conversationProcessing,
  isConversationProcessingLocked,
  MAX_CONSECUTIVE_ERRORS,
} from "./circuitBreaker.js";

const logger = createChildLogger("batch-scheduler");

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

/**
 * Schedules a debounced analysis run for a conversation.
 *
 * FIX #3: The async work inside setTimeout is now wrapped in an explicit
 * .catch() so DB errors don't produce unhandled promise rejections.
 * FIX #6: Calls pickBatchWithinBudget after fetching messages so token budget
 * is respected before handing the batch to the LLM.
 * FIX #7: Unified single-timer path -- always clear-and-reset one timer per
 * conversation key regardless of whether a cooldown is active.  The delay is
 * simply max(cooldownRemainder+500, debounce) so the same timer serves both
 * the "throttled by error cooldown" and "normal debounce" cases, eliminating
 * the previous two-path logic that could leave both timers live simultaneously.
 */
export function scheduleConversationAnalysis(conversationKey: string): void {
  if (isConversationProcessingLocked(conversationKey)) {
    return;
  }

  const convoCooldown = conversationErrorCooldown.get(conversationKey) ?? 0;
  const convoErrors = conversationConsecutiveErrors.get(conversationKey) ?? 0;

  // Hard-block: circuit breaker threshold reached AND cooldown still active.
  if (convoErrors >= MAX_CONSECUTIVE_ERRORS && Date.now() < convoCooldown) {
    return;
  }

  // Unified delay: honour the cooldown window if active, otherwise use the
  // normal debounce interval.  Always clear-and-reset so only ONE timer is
  // ever pending per conversation key regardless of call source.
  const now = Date.now();
  const delayMs =
    convoCooldown > now
      ? convoCooldown - now + 500
      : config.AI_ANALYSIS_DEBOUNCE_MS;

  const existingTimer = conversationDebounceTimers.get(conversationKey);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    conversationDebounceTimers.delete(conversationKey);

    // FIX TOCTOU: Set lock synchronously BEFORE the async DB fetch starts
    if (isConversationProcessingLocked(conversationKey)) {
      return;
    }
    const processingStartedAt = Date.now();
    conversationProcessing.set(conversationKey, processingStartedAt);

    // FIX #3: explicit .catch() -- no async arrow function to avoid unhandled rejection.
    getPendingMessagesByConversation(
      conversationKey,
      config.AI_ANALYSIS_MAX_BATCH_SIZE,
    )
      .then(async (messages: MessageRecord[]) => {
        if (messages.length === 0) {
          if (
            conversationProcessing.get(conversationKey) === processingStartedAt
          ) {
            conversationProcessing.delete(conversationKey);
          }
          return;
        }

        const processableMessages = await skipAgeRestrictedMessages(messages);
        if (processableMessages.length === 0) {
          if (
            conversationProcessing.get(conversationKey) === processingStartedAt
          ) {
            conversationProcessing.delete(conversationKey);
          }
          return;
        }

        // FIX #6: trim to token budget before sending to LLM.
        let trimmed = pickBatchWithinBudget(
          processableMessages,
          config.AI_ANALYSIS_MAX_TARGET_TOKENS,
          50,
        );

        // FIX #10: if every message individually exceeds the token budget,
        // fall back to the first message alone.
        if (trimmed.length === 0 && processableMessages.length > 0) {
          trimmed = processableMessages.slice(0, 1);
          logger.warn(
            {
              conversationKey,
              messageId: processableMessages[0]?.id,
              tokenBudget: config.AI_ANALYSIS_MAX_TARGET_TOKENS,
            },
            "All messages exceed token budget -- processing first message alone to avoid stuck-pending deadlock",
          );
        }

        return processBatch(conversationKey, trimmed, processingStartedAt);
      })
      .catch((err: unknown) => {
        if (
          conversationProcessing.get(conversationKey) === processingStartedAt
        ) {
          conversationProcessing.delete(conversationKey);
        }
        logger.error(
          {
            conversationKey,
            error: err instanceof Error ? err.message : String(err),
          },
          "Failed to fetch or dispatch pending messages for scheduled analysis",
        );
      });
  }, delayMs);

  conversationDebounceTimers.set(conversationKey, timer);
}
