import { createChildLogger } from "@bete/shared/logger";
import { LRUCache } from "lru-cache";
import { config } from "../../shared/config/config.js";
import { updateMessagesAIAnalysisBulk } from "../message-capture/messageStore.js";
import type {
  AnalysisResult,
  MessageRecord,
} from "../message-capture/types.js";
import {
  broadcastAnalysisCompleted,
  fireAlert,
  getConversationKey,
  LAST_ERROR,
  scheduleAutoDelete,
  workerPool,
} from "./circuitBreaker.js";
import { logModerationError } from "./responseLogger.js";

const logger = createChildLogger("individual-fallback");

// ---------------------------------------------------------------------------
// Individual fallback queue state
// ---------------------------------------------------------------------------

/** IDs currently being processed one-by-one (LRU-backed, max 10k entries). */
export const individualInFlight = new LRUCache<string, true>({ max: 10000 });

/**
 * Per-conversation count of in-flight individual messages.
 * (LRU-backed to prevent unbounded growth)
 */
export const individualInFlightByConversation = new LRUCache<string, number>({
  max: 10000,
});

/** Last-touched timestamp for pruning stale entries (LRU-backed). */
export const individualInFlightLastTouched = new LRUCache<string, number>({
  max: 10000,
});

/** Counter for observability. */
export let activeIndividualRequests = 0;

// ---------------------------------------------------------------------------
// Individual fallback circuit breaker (independent of batch CB)
// ---------------------------------------------------------------------------

let individualConsecutiveErrors = 0;
export let individualCooldownUntil = 0;
const INDIVIDUAL_COOLDOWN_MS = 60000;

// ---------------------------------------------------------------------------
// Individual fallback pipeline
// ---------------------------------------------------------------------------

/**
 * Processes a single message via the Piscina worker pool (offloaded from
 * main thread to avoid blocking the event loop).
 */
async function processIndividualFallback(
  message: MessageRecord,
): Promise<void> {
  const { id: messageId } = message;
  const conversationKey = getConversationKey(message);

  activeIndividualRequests++;
  individualInFlightByConversation.set(
    conversationKey,
    (individualInFlightByConversation.get(conversationKey) ?? 0) + 1,
  );
  individualInFlightLastTouched.set(conversationKey, Date.now());

  let exhaustedOnIncomplete = false;

  try {
    // Run the LLM-heavy work in the worker thread
    const workerResult = (await workerPool.run({
      type: "individual",
      message,
      skipNormalAnalysis: false,
    } as unknown)) as
      | { ok: true; results: AnalysisResult[] }
      | { ok: false; results: AnalysisResult[]; error: string };

    let analysisResult: { results: AnalysisResult[] } | null = null;
    let usedSimpleFallback = false;

    if (workerResult.ok) {
      const stillIncomplete = workerResult.results.some((r) =>
        r.flags.includes("analysis_incomplete"),
      );
      if (stillIncomplete) {
        exhaustedOnIncomplete = true;
        analysisResult = null;
      } else {
        analysisResult = workerResult;
      }
    }

    // Step 2: If normal analysis failed, try SIMPLE fallback via worker
    if (!analysisResult) {
      logger.info(
        { messageId },
        "Normal analysis failed -- trying simple text fallback via worker",
      );

      const simpleResult = (await workerPool.run({
        type: "individual",
        message,
        skipNormalAnalysis: true,
      } as unknown)) as
        | { ok: true; results: AnalysisResult[] }
        | { ok: false; results: AnalysisResult[]; error: string };

      if (simpleResult.ok) {
        analysisResult = simpleResult;
        usedSimpleFallback = true;
        exhaustedOnIncomplete = false;
      }
    }

    if (!analysisResult) {
      throw new Error(
        `Both normal and simple analysis failed for message ${messageId}`,
      );
    }

    if (usedSimpleFallback) {
      logger.info(
        { messageId, status: analysisResult.results[0]?.status },
        "Used simple text fallback for individual message (via worker)",
      );
    }

    // Main thread: DB writes + broadcast
    const updates = analysisResult.results.map((r) => ({
      messageId: r.messageId,
      result: {
        status: r.status,
        flags: JSON.stringify(r.flags),
        score: r.score,
        analysis: r.analysis,
        categories: r.categories,
        severity: r.severity,
        confidence: r.confidence,
        recommendedAction: r.recommendedAction,
        analyzedAt: Date.now(),
        error: null,
      },
    }));

    const rows = await updateMessagesAIAnalysisBulk(updates);
    for (const row of rows) {
      broadcastAnalysisCompleted(row);
      scheduleAutoDelete(row);

      // Update reputation autonomously
      if (row.ai_status === "clean") {
        import("./userReputationStore.js")
          .then((store) => store.recordCleanMessage(row.user_id, row.guild_id))
          .catch((e) =>
            logger.error(
              { error: e },
              "Failed to record clean message streak in fallback",
            ),
          );
      } else if (row.ai_status === "flagged" && row.ai_severity !== "none") {
        import("./userReputationStore.js")
          .then((store) =>
            store.recordInfraction(
              row.user_id,
              row.guild_id,
              row.ai_severity as "low" | "medium" | "high" | "critical",
            ),
          )
          .catch((e) =>
            logger.error(
              { error: e },
              "Failed to record infraction penalty in fallback",
            ),
          );
      }
    }

    const resultSummary = analysisResult.results[0];
    logModerationError([messageId], config.AI_LLM_MODEL, new Error("Success"), {
      phase: "individual_fallback",
      status: resultSummary?.status,
      flags: resultSummary?.flags,
      severity: resultSummary?.severity,
      confidence: resultSummary?.confidence,
    });

    individualConsecutiveErrors = 0;

    logger.debug(
      { messageId, status: analysisResult.results[0]?.status },
      "Individual fallback analysis complete (via worker)",
    );
  } catch (error) {
    individualConsecutiveErrors++;
    if (
      individualConsecutiveErrors >= config.AI_ANALYSIS_INDIVIDUAL_CB_THRESHOLD
    ) {
      individualCooldownUntil = Date.now() + INDIVIDUAL_COOLDOWN_MS;
      fireAlert({
        type: "individual_cb",
        consecutiveErrors: individualConsecutiveErrors,
        message: `Individual fallback circuit breaker triggered after ${individualConsecutiveErrors} consecutive errors`,
        lastError: LAST_ERROR.value,
      });
    }

    LAST_ERROR.value = error instanceof Error ? error.message : String(error);

    logModerationError(
      [messageId],
      config.AI_LLM_MODEL,
      error as Error | string,
      {
        phase: "individual_fallback",
        conversationKey,
        exhaustedOnIncomplete,
      },
    );

    if (exhaustedOnIncomplete) {
      await updateMessagesAIAnalysisBulk([
        {
          messageId,
          result: {
            status: "error",
            flags: JSON.stringify(["individual_analysis_exhausted"]),
            score: 0,
            analysis:
              "Individual fallback exhausted all retries: LLM consistently dropped this message even in single-target mode",
            categories: ["individual_analysis_exhausted"],
            severity: "none",
            confidence: 0,
            recommendedAction: "review",
            analyzedAt: Date.now(),
            error: LAST_ERROR.value,
          },
        },
      ]).catch((dbErr: unknown) => {
        logger.error(
          { messageId, error: String(dbErr) },
          "Failed to write terminal exhausted status",
        );
      });
      logger.warn(
        { messageId },
        "Individual fallback exhausted -- marked as individual_analysis_exhausted",
      );
    } else {
      logger.error(
        {
          messageId,
          error: LAST_ERROR.value,
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Individual fallback analysis failed (transient) -- will be retried",
      );
    }
  } finally {
    activeIndividualRequests--;
    individualInFlight.delete(messageId);

    const prev = individualInFlightByConversation.get(conversationKey) ?? 1;
    if (prev <= 1) {
      individualInFlightByConversation.delete(conversationKey);
      individualInFlightLastTouched.delete(conversationKey);
    } else {
      individualInFlightByConversation.set(conversationKey, prev - 1);
      individualInFlightLastTouched.set(conversationKey, Date.now());
    }
  }
}

// ---------------------------------------------------------------------------
// Enqueue individual fallbacks
// ---------------------------------------------------------------------------

/**
 * Fans out message records to the individual fallback queue.
 *
 * FIX #1: Checks concurrency cap before admitting new work.
 * FIX #5: Checks individual circuit breaker before admitting new work.
 */
export function enqueueIndividualFallbacks(messages: MessageRecord[]): void {
  // FIX #5: Honour the individual circuit breaker.
  if (Date.now() < individualCooldownUntil) {
    logger.warn(
      {
        until: new Date(individualCooldownUntil).toISOString(),
        skipped: messages.length,
      },
      "Individual fallback circuit breaker active -- messages will be recovered later",
    );
    return;
  }

  // FIX #5: Enforce concurrency cap
  const maxConcurrent = config.AI_ANALYSIS_INDIVIDUAL_MAX_CONCURRENT ?? 50;
  const availableSlots = Math.max(0, maxConcurrent - activeIndividualRequests);
  if (availableSlots <= 0) {
    logger.debug(
      { maxConcurrent, active: activeIndividualRequests },
      "Individual fallback concurrency cap reached -- messages will be recovered later",
    );
    return;
  }

  const newMessages = messages
    .filter((m) => !individualInFlight.has(m.id))
    .slice(0, availableSlots);
  if (newMessages.length === 0) return;

  logger.debug(
    {
      count: newMessages.length,
      messageIds: newMessages.map((m) => m.id),
    },
    "Enqueueing individual fallback analysis for batch-incomplete messages",
  );

  for (const msg of newMessages) {
    individualInFlight.set(msg.id, true);
    processIndividualFallback(msg).catch((err: unknown) => {
      logger.error(
        { messageId: msg.id, error: String(err) },
        "Unexpected uncaught error escaping processIndividualFallback",
      );
      individualInFlight.delete(msg.id);
      const ck = getConversationKey(msg);
      const prev = individualInFlightByConversation.get(ck) ?? 1;
      if (prev <= 1) {
        individualInFlightByConversation.delete(ck);
        individualInFlightLastTouched.delete(ck);
      } else {
        individualInFlightByConversation.set(ck, prev - 1);
        individualInFlightLastTouched.set(ck, Date.now());
      }
    });
  }
}
