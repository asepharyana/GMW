import type { Client } from "discord.js-selfbot-v13";
import { createChildLogger } from "@/shared/logger/index";
import { config } from "../../shared/config/index.js";
import type { EventBroadcaster } from "../event-broadcaster/index.js";
import { messageStore } from "../message-capture/messageStore.js";
import type { AnalysisQueueStatus } from "../message-capture/types.js";
import {
  activeMediaRequests,
  activeRequests,
  activeTextRequests,
  buildAgeRestrictedSkipResult,
  buildSkipAnalysisUserResult,
  isAgeRestrictedMessage,
  isSkipAnalysisUser,
} from "./batchProcessor.js";
import { scheduleConversationAnalysis } from "./batchScheduler.js";
import { getConversationKey } from "./circuitBreaker.js";
import { conversationDebounceTimers } from "./conversationState.js";
import {
  activeIndividualRequests,
  individualCooldownUntil,
  individualInFlight,
} from "./individualFallbackProcessor.js";
import {
  broadcastAnalysisCompleted,
  LAST_ERROR,
  setModerationClient,
  setSharedEventBroadcaster,
} from "./moderationState.js";
import { startRecoveryWorker } from "./recovery-worker.js";

const logger = createChildLogger("ai-analyzer");

// ---------------------------------------------------------------------------
// Public API — queueing, status, worker startup
// ---------------------------------------------------------------------------

/**
 * Queues a message for analysis (debounced by conversation).
 *
 * Messages that never need an LLM call are short-circuited here and recorded
 * with their skip verdict: age-restricted messages and configured skip-list
 * users.
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
      await recordSkip(message.id, buildAgeRestrictedSkipResult());
      logger.debug(
        { messageId },
        "Skipped AI analysis for age-restricted message",
      );
      return;
    }

    if (isSkipAnalysisUser(message)) {
      await recordSkip(message.id, buildSkipAnalysisUserResult());
      logger.debug(
        { messageId, userId: message.user_id },
        "Skipped AI analysis for configured skip-list user",
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

/** Persist a skip verdict and broadcast it so the dashboard reflects it. */
async function recordSkip(
  messageId: string,
  result: Parameters<typeof messageStore.updateMessageAIAnalysis>[1],
): Promise<void> {
  const updated = await messageStore.updateMessageAIAnalysis(messageId, result);
  if (updated) {
    broadcastAnalysisCompleted(updated);
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
    activeTextRequests,
    activeMediaRequests,
    activeIndividualRequests,
    individualInFlightCount: individualInFlight.size,
    individualCircuitBreakerActive: Date.now() < individualCooldownUntil,
    lastError: LAST_ERROR.value,
  };
}

/**
 * Starts the background workers behind the analysis pipeline:
 *  - the recovery worker (stranded pending / incomplete messages + cache prune)
 *  - the optional culture and user-profile learners.
 *
 * Also injects the Discord client and event broadcaster into the pipeline
 * state so downstream modules can act and publish.
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

  startRecoveryWorker();
}
