import { createChildLogger } from "@/shared/logger/index";
import { config } from "../../shared/config/index.js";
import { messageStore } from "../message-capture/messageStore.js";
import type { MessageRecord } from "../message-capture/types.js";
import { type AnalysisLane, splitMessagesByLane } from "./analysisLanes.js";
import { computeBudgetOverflowMessages } from "./batchBudget.js";
import {
  pickBatchWithinBudget,
  processBatch,
  skipAgeRestrictedMessages,
  skipAnalysisUserMessages,
} from "./batchProcessor.js";
import {
  clearConversationProcessing,
  conversationConsecutiveErrors,
  conversationDebounceTimers,
  conversationErrorCooldown,
  getConversationProcessingStartedAt,
  isConversationProcessingLocked,
  MAX_CONSECUTIVE_ERRORS,
  setConversationProcessing,
} from "./conversationState.js";

const logger = createChildLogger("batch-scheduler");

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

/**
 * Timer key namespaced by lane so one conversation can hold a text timer AND
 * a media timer independently.
 */
function timerKey(conversationKey: string, lane: AnalysisLane): string {
  return `${conversationKey}::${lane}`;
}

/**
 * Schedules a debounced analysis run for a conversation.
 *
 * `lane` optional:
 * - With a lane: takes that lane's processing lock; if the SAME lane is
 *   already processing, skip. The OTHER lane's lock does not block this one —
 *   text and media of one conversation never block each other.
 * - Without a lane (recovery worker / whole-conversation): takes BOTH lane
 *   locks (each lock independently) and dispatches both lanes concurrently.
 *   Each lane releases its own lock when its worker job finishes.
 *
 * The async work inside setTimeout is wrapped in an explicit .catch() so
 * DB errors don't produce unhandled promise rejections. Uses a unified
 * single-timer path: always clear-and-reset one timer per conversation+lane
 * regardless of whether a cooldown is active.
 */
export function scheduleConversationAnalysis(
  conversationKey: string,
  lane?: AnalysisLane,
): void {
  const lanesToSchedule: AnalysisLane[] = lane ? [lane] : ["text", "media"];

  const convoCooldown = conversationErrorCooldown.get(conversationKey) ?? 0;
  const convoErrors = conversationConsecutiveErrors.get(conversationKey) ?? 0;

  // Hard-block: circuit breaker threshold reached AND cooldown still active.
  if (convoErrors >= MAX_CONSECUTIVE_ERRORS && Date.now() < convoCooldown) {
    return;
  }

  // Unified delay: honour the cooldown window if active, otherwise use the
  // normal debounce interval. Always clear-and-reset so only ONE timer is
  // ever pending per conversation+lane regardless of call source.
  const now = Date.now();
  const delayMs =
    convoCooldown > now
      ? convoCooldown - now + 500
      : config.AI_ANALYSIS_DEBOUNCE_MS;

  for (const targetLane of lanesToSchedule) {
    if (isConversationProcessingLocked(conversationKey, targetLane)) {
      continue;
    }
    scheduleLaneTimer(conversationKey, targetLane, delayMs);
  }
}

function scheduleLaneTimer(
  conversationKey: string,
  lane: AnalysisLane,
  delayMs: number,
): void {
  const tKey = timerKey(conversationKey, lane);
  const existingTimer = conversationDebounceTimers.get(tKey);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    conversationDebounceTimers.delete(tKey);

    if (isConversationProcessingLocked(conversationKey, lane)) {
      logger.warn(
        { conversationKey, lane, tKey },
        "scheduleLaneTimer: lane locked, skipping dispatch",
      );
      return;
    }
    const processingStartedAt = Date.now();
    setConversationProcessing(conversationKey, lane, processingStartedAt);
    logger.debug(
      { conversationKey, lane, processingStartedAt },
      "scheduleLaneTimer: lock acquired, dispatching batch fetch",
    );

    messageStore
      .getPendingMessagesByConversation(
        conversationKey,
        config.AI_ANALYSIS_MAX_BATCH_SIZE,
      )
      .then(async (messages: MessageRecord[]) => {
        // Filter to THIS lane only. The DB fetch is lane-agnostic (a
        // conversation key can have both text and media pending); each lane
        // picks its own subset so text and media never share a worker job.
        const { [lane]: laneMessages } = splitMessagesByLane(messages);
        if (laneMessages.length === 0) {
          // No work for this lane — the other lane (if scheduled) owns the
          // rest. Clear this lane's lock so the debounce can re-arm.
          releaseLaneSlot(conversationKey, lane, processingStartedAt);
          return;
        }

        const processableMessages = await skipAnalysisUserMessages(
          await skipAgeRestrictedMessages(laneMessages),
        );
        if (processableMessages.length === 0) {
          releaseLaneSlot(conversationKey, lane, processingStartedAt);
          return;
        }

        let trimmed = pickBatchWithinBudget(
          processableMessages,
          config.AI_ANALYSIS_MAX_TARGET_TOKENS,
          50,
        );

        // If every message individually exceeds the token budget,
        // fall back to the first message alone to avoid stuck-pending deadlock.
        if (trimmed.length === 0 && processableMessages.length > 0) {
          trimmed = processableMessages.slice(0, 1);
          logger.warn(
            {
              conversationKey,
              lane,
              messageId: processableMessages[0]?.id,
              tokenBudget: config.AI_ANALYSIS_MAX_TARGET_TOKENS,
            },
            "All messages exceed token budget -- processing first message alone to avoid stuck-pending deadlock",
          );
        }

        // Un-claim messages that did NOT make it into the trimmed batch.
        // getPendingMessagesByConversation() flips EVERY fetched pending row
        // to `processing`; pickBatchWithinBudget() may then stop early on the
        // token budget, leaving the tail rows stuck in `processing` forever
        // (recovery only reverts rows older than 120s, and these keep getting
        // re-claimed each wave). Return them to `pending` so the next wave
        // picks them up instead of leaking processing slots.
        const unclaimed = computeBudgetOverflowMessages(
          processableMessages,
          trimmed,
        );
        if (unclaimed.length > 0) {
          const unclaimedRows = await messageStore
            .updateMessagesAIAnalysisBulk(
              unclaimed.map((msg) => ({
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
            .catch((err: unknown) => {
              logger.error(
                {
                  conversationKey,
                  lane,
                  count: unclaimed.length,
                  error: err instanceof Error ? err.message : String(err),
                },
                "Failed to un-claim budget-overflow messages back to pending",
              );
              return null;
            });
          if (unclaimedRows) {
            logger.debug(
              {
                conversationKey,
                lane,
                unclaimedCount: unclaimed.length,
              },
              "Returned budget-overflow messages to pending for next wave",
            );
          }
        }

        // processBatch releases THIS lane's lock the moment its worker job
        // finishes and re-schedules the same lane — independent of the other
        // lane's (possibly much slower) media batch.
        return processBatch(
          conversationKey,
          lane,
          trimmed,
          processingStartedAt,
        );
      })
      .catch((err: unknown) => {
        releaseLaneSlot(conversationKey, lane, processingStartedAt);
        logger.error(
          {
            conversationKey,
            lane,
            error: err instanceof Error ? err.message : String(err),
          },
          "Failed to fetch or dispatch pending messages for scheduled analysis",
        );
      });
  }, delayMs);

  conversationDebounceTimers.set(tKey, timer);
}

/**
 * Clears the processing lock for a lane, but ONLY if this timer still owns it
 * (processingStartedAt matches). Guards against clearing a newer slot that was
 * taken after this timer's window expired.
 */
function releaseLaneSlot(
  conversationKey: string,
  lane: AnalysisLane,
  processingStartedAt: number,
): void {
  if (
    getConversationProcessingStartedAt(conversationKey, lane) ===
    processingStartedAt
  ) {
    clearConversationProcessing(conversationKey, lane);
  }
}
