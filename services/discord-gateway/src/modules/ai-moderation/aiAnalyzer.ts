import { existsSync } from "node:fs";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { createChildLogger } from "@bete/shared/logger";
import type { Client } from "discord.js-selfbot-v13";
import { Piscina } from "piscina";
import { config } from "../../shared/config/config.js";
import type { EventBroadcaster } from "../event-broadcaster/index.js";
import { invalidateAnalyticsCache } from "../message-capture/analyticsStore.js";
import { isAgeRestrictedMetadata } from "../message-capture/messageMetadata.js";
import {
  getConversationKeysWithIncompleteAnalysis,
  getIncompleteMessagesByConversation,
  getMessageById,
  getPendingConversationKeys,
  getPendingMessagesByConversation,
  updateMessageAIAnalysis,
  updateMessagesAIAnalysisBulk,
} from "../message-capture/messageStore.js";
import type {
  AnalysisQueueStatus,
  AnalysisResult,
  MessageRecord,
  ModerationBroadcaster,
} from "../message-capture/types.js";
import { attemptAutoDeleteFlaggedMessage } from "./autoDeleteManager.js";
import { estimateTokens } from "./conversationContext.js";
import { logModerationError } from "./responseLogger.js";

const logger = createChildLogger("ai-analyzer");

type ModerationGlobal = typeof globalThis & {
  moderationBroadcaster?: ModerationBroadcaster;
};

function getModerationBroadcaster(): ModerationBroadcaster | undefined {
  return (globalThis as ModerationGlobal).moderationBroadcaster;
}

// Redis EventBroadcaster — set by startPendingAIAnalysisWorker.
// Used to publish analysis completion events so the backend
// redis-bridge can forward them to frontend WebSocket clients.
let _redisEventBroadcaster: EventBroadcaster | undefined;

function broadcastAnalysisCompleted(row: MessageRecord): void {
  // In-memory WS broadcast (direct-connected DG clients)
  getModerationBroadcaster()?.messageAnalyzed(row);
  // Redis pub/sub broadcast → backend → frontend WebSocket
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

function scheduleAutoDelete(row: MessageRecord): void {
  if (row.ai_status !== "flagged" && row.ai_status !== "warn") return;
  const run = () => {
    attemptAutoDeleteFlaggedMessage(moderationClient, row).catch(
      (error: unknown) => {
        logger.error(
          {
            messageId: row.id,
            error: error instanceof Error ? error.message : String(error),
          },
          "Unexpected auto-delete error",
        );
      },
    );
  };

  if (config.AUTO_DELETE_FLAGGED_DELAY_MS > 0) {
    setTimeout(run, config.AUTO_DELETE_FLAGGED_DELAY_MS);
    return;
  }
  setImmediate(run);
}

function isAgeRestrictedMessage(message: MessageRecord): boolean {
  return isAgeRestrictedMetadata(message.metadata);
}

function buildAgeRestrictedSkipResult(): {
  status: "clean";
  flags: string | null;
  score: number;
  analysis: string;
  categories: string[];
  severity: "none";
  confidence: number;
  recommendedAction: "none";
  analyzedAt: number;
  error: null;
} {
  return {
    status: "clean",
    flags: JSON.stringify(["age_restricted"]),
    score: 0,
    analysis: "Skipped moderation for age-restricted content.",
    categories: ["age_restricted"],
    severity: "none",
    confidence: 1,
    recommendedAction: "none",
    analyzedAt: Date.now(),
    error: null,
  };
}

async function skipAgeRestrictedMessages(
  messages: MessageRecord[],
): Promise<MessageRecord[]> {
  const ageRestrictedMessages = messages.filter(isAgeRestrictedMessage);
  if (ageRestrictedMessages.length === 0) {
    return messages;
  }

  const skippedRows = await updateMessagesAIAnalysisBulk(
    ageRestrictedMessages.map((message) => ({
      messageId: message.id,
      result: buildAgeRestrictedSkipResult(),
    })),
  );

  for (const row of skippedRows) {
    broadcastAnalysisCompleted(row);
  }

  const skippedIds = new Set(
    ageRestrictedMessages.map((message) => message.id),
  );
  return messages.filter((message) => !skippedIds.has(message.id));
}

// ---------------------------------------------------------------------------
// Batch pipeline state
// ---------------------------------------------------------------------------

/** Debounce timer handle per conversation key. */
const conversationDebounceTimers = new Map<string, NodeJS.Timeout>();
/** Timestamp of when processing started per conversation key. */
const conversationProcessing = new Map<string, number>();
/** Cooldown expiry timestamp per conversation key after an error. */
const conversationErrorCooldown = new Map<string, number>();

let activeRequests = 0;
let lastError: string | null = null;
let moderationClient: Client | undefined;

// Batch circuit breaker
const conversationConsecutiveErrors = new Map<string, number>();
const MAX_CONSECUTIVE_ERRORS = 5;
const CONVERSATION_CB_COOLDOWN_MS = 60000;

/** Alert sinks — called when circuit breakers or sustained errors fire. */
type CircuitBreakerAlert = {
  type: "conversation_cb" | "individual_cb" | "sustained_error";
  conversationKey?: string;
  consecutiveErrors: number;
  message: string;
  lastError?: string | null;
};

/** Registered alert handlers */
const alertHandlers: Array<(alert: CircuitBreakerAlert) => void> = [];

/**
 * Register an alert handler (e.g., for webhook integration).
 */
export function onCircuitBreakerAlert(
  handler: (alert: CircuitBreakerAlert) => void,
): void {
  alertHandlers.push(handler);
}

function fireAlert(alert: CircuitBreakerAlert): void {
  logger.warn(alert, `CB Alert: ${alert.type} — ${alert.message}`);
  for (const handler of alertHandlers) {
    try {
      handler(alert);
    } catch {
      // handler errors are non-critical
    }
  }
}

function recordConversationBatchFailure(conversationKey: string): void {
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
      lastError,
    });
    conversationConsecutiveErrors.set(conversationKey, 0);
  }
}

function resetConversationBatchFailures(conversationKey: string): void {
  conversationConsecutiveErrors.delete(conversationKey);
}

// ---------------------------------------------------------------------------
// Individual fallback queue — runs PARALLEL to the batch pipeline.
//
// Design guarantees:
//  • Concurrency is capped at config.AI_ANALYSIS_INDIVIDUAL_MAX_CONCURRENT.
//  • A flat Set<messageId> de-duplicates so the same message can't be
//    in-flight twice (Discord snowflakes are globally unique, but be safe).
//  • A Map<conversationKey, count> lets the recovery worker skip conversations
//    that already have individual work in progress (#4 fix).
//  • A separate circuit breaker prevents a cascade of individual failures
//    from hammering a down/rate-limited LLM endpoint (#1+#5 fix).
// ---------------------------------------------------------------------------

/** IDs currently being processed one-by-one. */
const individualInFlight = new Set<string>();

/**
 * Per-conversation count of in-flight individual messages.
 * Used by the recovery worker to avoid re-scheduling a conversation that
 * already has individual fallback work running for it.
 */
const individualInFlightByConversation = new Map<string, number>();

/** Last-touched timestamp for pruning stale entries. */
const individualInFlightLastTouched = new Map<string, number>();

/** Counter for observability. */
let activeIndividualRequests = 0;

// Individual fallback circuit breaker (independent of batch CB)
let individualConsecutiveErrors = 0;
let individualCooldownUntil = 0;
const INDIVIDUAL_COOLDOWN_MS = 30000;

// ---------------------------------------------------------------------------
// Piscina worker pool (batch path only)
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

const workerPool = new Piscina({
  filename: fileURLToPath(getAnalysisWorkerUrl()),
  execArgv: process.execArgv,
  maxThreads: config.PISCINA_MAX_THREADS ?? availableParallelism(),
});

interface AnalysisWorkerResponse {
  ok: boolean;
  conversationKey: string;
  rows: MessageRecord[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Exported helpers
// ---------------------------------------------------------------------------

/**
 * Gets the conversation key for a message (thread_id or channel_id).
 */
export function getConversationKey(message: MessageRecord): string {
  return message.thread_id || message.channel_id;
}

/**
 * Picks a batch of messages within a token budget.
 * `tokensPerMessage` accounts for JSON structure overhead around each entry.
 * Uses a rough character-based token estimate (avoids async formatMessageForPrompt
 * since this function runs in a synchronous promise chain).
 */
export function pickBatchWithinBudget(
  messages: MessageRecord[],
  maxTokens: number,
  tokensPerMessage: number,
): MessageRecord[] {
  const batch: MessageRecord[] = [];
  let usedTokens = 0;

  for (const msg of messages) {
    const content = msg.edited_content ?? msg.content;
    // Accurate token count via tiktoken (+ overhead for JSON structure)
    const msgTokens = estimateTokens(content) + tokensPerMessage;

    if (usedTokens + msgTokens <= maxTokens) {
      batch.push(msg);
      usedTokens += msgTokens;
    }
  }

  return batch;
}

// ---------------------------------------------------------------------------
// Conversation lock helpers
// ---------------------------------------------------------------------------

function isConversationProcessingLocked(conversationKey: string): boolean {
  const startedAt = conversationProcessing.get(conversationKey);
  // FIX #7: use configurable timeout that exceeds (LLM timeout × max retries).
  // Old hardcoded value was 30 000 ms — shorter than a single LLM call under retries.
  return Boolean(
    startedAt &&
      Date.now() - startedAt < config.AI_ANALYSIS_PROCESSING_TIMEOUT_MS,
  );
}

// ---------------------------------------------------------------------------
// Individual fallback pipeline
// ---------------------------------------------------------------------------

/**
 * Processes a single message via the Piscina worker pool (offloaded from
 * main thread to avoid blocking the event loop).
 *
 * The worker handles:
 * 1. DB initialization
 * 2. Context fetching + conversation building
 * 3. Attachment fetching
 * 4. LLM analysis (normal or simple fallback)
 *
 * The main thread handles:
 * - DB writes (updateMessagesAIAnalysisBulk)
 * - WebSocket/Redis broadcast
 * - Analytics cache invalidation
 * - Auto-delete scheduling
 *
 * Infinite-loop prevention: if the LLM consistently drops the single target
 * message across all retries (analysis_incomplete), we write a terminal flag
 * 'individual_analysis_exhausted' to DB instead of 'analysis_incomplete'.
 * The recovery worker only queries for 'analysis_incomplete', so exhausted
 * messages are permanently excluded from the reprocessing loop.
 * Transient failures (network/parse/DB) are NOT written as exhausted — they
 * stay as 'analysis_incomplete' so the circuit-breaker-throttled recovery
 * cycle can retry them later.
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
    // ── Run the LLM-heavy work in the worker thread ──
    // Try normal analysis first. The worker handles retries internally.
    const workerResult = (await workerPool.run({
      type: "individual",
      message,
      skipNormalAnalysis: false,
    } as any)) as
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

    // ── Step 2: If normal analysis failed, try SIMPLE fallback via worker ──
    if (!analysisResult) {
      logger.info(
        { messageId },
        "Normal analysis failed (or incomplete) — trying simple text fallback via worker",
      );

      const simpleResult = (await workerPool.run({
        type: "individual",
        message,
        skipNormalAnalysis: true,
      } as any)) as
        | { ok: true; results: AnalysisResult[] }
        | { ok: false; results: AnalysisResult[]; error: string };

      if (simpleResult.ok) {
        analysisResult = simpleResult;
        usedSimpleFallback = true;
        exhaustedOnIncomplete = false;
      }
    }

    // If both failed, throw to go to the catch block
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

    // ── Main thread: DB writes + broadcast (non-blocking work) ──
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
      invalidateAnalyticsCache(row.guild_id);
      scheduleAutoDelete(row);
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
        lastError,
      });
    }

    lastError = error instanceof Error ? error.message : String(error);

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
            error: lastError,
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
        "Individual fallback exhausted — marked as individual_analysis_exhausted",
      );
    } else {
      logger.error(
        {
          messageId,
          error: lastError,
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Individual fallback analysis failed (transient) — will be retried",
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

/**
 * Fans out message records to the individual fallback queue.
 *
 * FIX #1: Checks concurrency cap before admitting new work.
 * FIX #5: Checks individual circuit breaker before admitting new work.
 * Messages that cannot be admitted remain as `error/analysis_incomplete` in
 * the DB and will be picked up by the recovery worker on the next interval.
 */
function enqueueIndividualFallbacks(messages: MessageRecord[]): void {
  // FIX #5: Honour the individual circuit breaker.
  if (Date.now() < individualCooldownUntil) {
    logger.warn(
      {
        until: new Date(individualCooldownUntil).toISOString(),
        skipped: messages.length,
      },
      "Individual fallback circuit breaker active — messages will be recovered later",
    );
    return;
  }

  // FIX #5: Enforce concurrency cap — do not admit more individual fallbacks
  // than the configured limit. Excess messages stay as error/analysis_incomplete
  // and will be recovered on the next worker tick.
  const maxConcurrent = config.AI_ANALYSIS_INDIVIDUAL_MAX_CONCURRENT ?? 50;
  const availableSlots = Math.max(0, maxConcurrent - activeIndividualRequests);
  if (availableSlots <= 0) {
    logger.debug(
      { maxConcurrent, active: activeIndividualRequests },
      "Individual fallback concurrency cap reached — messages will be recovered later",
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
    individualInFlight.add(msg.id);
    // Fire-and-forget: processIndividualFallback handles all errors internally.
    processIndividualFallback(msg).catch((err: unknown) => {
      // Belt-and-suspenders guard — should never reach here.
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

// ---------------------------------------------------------------------------
// Batch pipeline
// ---------------------------------------------------------------------------

async function processBatch(
  conversationKey: string,
  messages: MessageRecord[],
): Promise<void> {
  if (messages.length === 0) return;
  const cooldownUntil = conversationErrorCooldown.get(conversationKey) ?? 0;
  if (Date.now() < cooldownUntil) {
    return;
  }

  activeRequests++;
  let shouldScheduleNext = false;
  const processingStartedAt = Date.now();
  conversationProcessing.set(conversationKey, processingStartedAt);
  try {
    const result = (await workerPool.run({
      type: "batch",
      conversationKey,
      messages,
    })) as AnalysisWorkerResponse;

    // Do not broadcast or auto-delete if it's an API failure that will be reverted.
    // We check the flags to see if it's an API failure.
    for (const row of result.rows) {
      let isApiFailure = false;
      if (row.ai_status === "error") {
        try {
          const flags = JSON.parse(row.ai_moderation_flags ?? "[]") as string[];
          isApiFailure = flags.includes("analysis_api_failed");
        } catch {}
      }

      if (!isApiFailure) {
        broadcastAnalysisCompleted(row);
        scheduleAutoDelete(row);
      }
    }

    if (!result.ok) {
      recordConversationBatchFailure(conversationKey);

      // Batch failed entirely — fall back all messages to individual queue
      // so no message is permanently lost behind a cooldown.
      logger.warn(
        {
          conversationKey,
          messageCount: messages.length,
          error: result.error,
        },
        "Batch failed entirely — routing all messages to individual fallback queue",
      );
      enqueueIndividualFallbacks(messages);

      lastError = result.error ?? "Analysis worker failed";
      conversationErrorCooldown.set(
        conversationKey,
        Date.now() + config.AI_ANALYSIS_ERROR_COOLDOWN_MS,
      );
      logger.error(
        {
          conversationKey,
          error: lastError,
          messageCount: messages.length,
          messageIds: messages.map((m) => m.id),
          cooldownUntil: new Date(
            Date.now() + config.AI_ANALYSIS_ERROR_COOLDOWN_MS,
          ).toISOString(),
          timestamp: new Date().toISOString(),
        },
        "Batch analysis failed, will retry after cooldown",
      );
      return;
    }

    // Batch succeeded — but check for messages the LLM silently dropped or failed to parse/API.
    // Rows with flag "analysis_incomplete", "analysis_parse_failed", or "analysis_api_failed"
    // were produced by the client as synthetic errors.
    const incompleteMessages: MessageRecord[] = [];
    const parseFailedMessages: MessageRecord[] = [];
    const apiFailedMessages: MessageRecord[] = [];

    for (const msg of messages) {
      const row = result.rows.find((r) => r.id === msg.id);
      if (!row) {
        incompleteMessages.push(msg);
        continue;
      }
      if (row.ai_status === "error") {
        let flags: string[] = [];
        try {
          flags = JSON.parse(row.ai_moderation_flags ?? "[]") as string[];
        } catch {}

        if (flags.includes("analysis_incomplete")) {
          incompleteMessages.push(msg);
        } else if (flags.includes("analysis_parse_failed")) {
          parseFailedMessages.push(msg);
        } else if (flags.includes("analysis_api_failed")) {
          apiFailedMessages.push(msg);
        }
      }
    }

    const messagesForIndividualQueue = [
      ...incompleteMessages,
      ...parseFailedMessages,
    ];

    if (messagesForIndividualQueue.length > 0) {
      logger.warn(
        {
          conversationKey,
          count: messagesForIndividualQueue.length,
          ids: messagesForIndividualQueue.map((m) => m.id),
          totalBatchSize: messages.length,
        },
        "Batch returned incomplete or unparseable results — fanning out to individual fallback queue",
      );
      enqueueIndividualFallbacks(messagesForIndividualQueue);
    }

    if (apiFailedMessages.length > 0) {
      logger.warn(
        {
          conversationKey,
          count: apiFailedMessages.length,
          ids: apiFailedMessages.map((m) => m.id),
        },
        "Batch returned API failures — reverting to pending to put back in queue",
      );

      // Revert to pending so they are picked up again
      const revertedRows = await updateMessagesAIAnalysisBulk(
        apiFailedMessages.map((msg) => ({
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
      ).catch((err) => {
        logger.error(
          { error: String(err) },
          "Failed to revert API failures to pending",
        );
        return [];
      });

      for (const row of revertedRows) {
        // Broadcast the pending status so the UI knows it's back in queue
        broadcastAnalysisCompleted(row);
      }

      // Trigger conversation cooldown so we don't tight loop the API
      recordConversationBatchFailure(conversationKey);
      conversationErrorCooldown.set(
        conversationKey,
        Date.now() + config.AI_ANALYSIS_ERROR_COOLDOWN_MS,
      );

      // FIX: Release the processing lock immediately so the cooldown timer
      // (not the processing-timeout expiry) controls when this conversation
      // is next eligible.  Without this the lock would hold for the full
      // AI_ANALYSIS_PROCESSING_TIMEOUT_MS before the recovery worker could
      // pick the reverted-pending messages back up.
      if (conversationProcessing.get(conversationKey) === processingStartedAt) {
        conversationProcessing.delete(conversationKey);
      }

      // FIX: Do NOT set shouldScheduleNext = true here.  The reverted messages
      // are now 'pending' again.  scheduleConversationAnalysis would race with
      // the recovery worker and schedule the same conversation twice — once
      // immediately (via shouldScheduleNext) and once after the cooldown
      // (via recovery worker).  Let the cooldown gate the next attempt.
      shouldScheduleNext = false;
    }

    if (apiFailedMessages.length === 0) {
      resetConversationBatchFailures(conversationKey);
      conversationErrorCooldown.delete(conversationKey);
    }
    shouldScheduleNext = true;
  } catch (error) {
    recordConversationBatchFailure(conversationKey);

    // Unhandled exception — route everything to individual fallback.
    logger.warn(
      { conversationKey, messageCount: messages.length },
      "Batch threw exception — routing all messages to individual fallback queue",
    );
    enqueueIndividualFallbacks(messages);

    lastError = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    conversationErrorCooldown.set(
      conversationKey,
      Date.now() + config.AI_ANALYSIS_ERROR_COOLDOWN_MS,
    );
    logger.error(
      {
        conversationKey,
        error: lastError,
        stack: errorStack,
        messageCount: messages.length,
        messageIds: messages.map((m) => m.id),
        cooldownUntil: new Date(
          Date.now() + config.AI_ANALYSIS_ERROR_COOLDOWN_MS,
        ).toISOString(),
        timestamp: new Date().toISOString(),
      },
      "Analysis worker failed, will retry after cooldown",
    );
  } finally {
    activeRequests--;
    if (conversationProcessing.get(conversationKey) === processingStartedAt) {
      conversationProcessing.delete(conversationKey);
    }
    if (shouldScheduleNext) {
      setImmediate(() => scheduleConversationAnalysis(conversationKey));
    }
  }
}

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
 */
function scheduleConversationAnalysis(conversationKey: string): void {
  if (isConversationProcessingLocked(conversationKey)) {
    return;
  }

  const convoCooldown = conversationErrorCooldown.get(conversationKey) ?? 0;
  const convoErrors = conversationConsecutiveErrors.get(conversationKey) ?? 0;

  if (convoCooldown && Date.now() < convoCooldown) {
    if (!conversationDebounceTimers.has(conversationKey)) {
      const remaining = convoCooldown - Date.now();
      const timer = setTimeout(() => {
        conversationDebounceTimers.delete(conversationKey);
        scheduleConversationAnalysis(conversationKey);
      }, remaining + 500);
      conversationDebounceTimers.set(conversationKey, timer);
    }
    return;
  }

  // Block scheduling if this conversation already hit the per-conversation
  // error threshold — prevents rapid retry loops on the same broken convo.
  if (convoErrors >= MAX_CONSECUTIVE_ERRORS && Date.now() < convoCooldown) {
    return;
  }

  const existingTimer = conversationDebounceTimers.get(conversationKey);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    conversationDebounceTimers.delete(conversationKey);

    // FIX #3: explicit .catch() — no async arrow function to avoid unhandled rejection.
    getPendingMessagesByConversation(
      conversationKey,
      config.AI_ANALYSIS_MAX_BATCH_SIZE,
    )
      .then(async (messages) => {
        if (messages.length === 0) return;

        const processableMessages = await skipAgeRestrictedMessages(messages);
        if (processableMessages.length === 0) return;

        // FIX #6: trim to token budget before sending to LLM.
        // 50 tokens overhead accounts for JSON structure + id/username fields.
        let trimmed = pickBatchWithinBudget(
          processableMessages,
          config.AI_ANALYSIS_MAX_TARGET_TOKENS,
          50,
        );

        // FIX #10: if every message individually exceeds the token budget,
        // pickBatchWithinBudget returns [] — which would leave them permanently
        // stuck as `pending`.  Fall back to the first message alone so at
        // least one makes progress; the rest will be processed in later ticks.
        if (trimmed.length === 0 && processableMessages.length > 0) {
          trimmed = processableMessages.slice(0, 1);
          logger.warn(
            {
              conversationKey,
              messageId: processableMessages[0]?.id,
              tokenBudget: config.AI_ANALYSIS_MAX_TARGET_TOKENS,
            },
            "All messages exceed token budget — processing first message alone to avoid stuck-pending deadlock",
          );
        }

        return processBatch(conversationKey, trimmed);
      })
      .catch((err: unknown) => {
        logger.error(
          {
            conversationKey,
            error: err instanceof Error ? err.message : String(err),
          },
          "Failed to fetch or dispatch pending messages for scheduled analysis",
        );
      });
  }, config.AI_ANALYSIS_DEBOUNCE_MS);

  conversationDebounceTimers.set(conversationKey, timer);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Queues a message for analysis (debounced by conversation).
 */
export async function queueMessageAnalysis(messageId: string): Promise<void> {
  if (!config.AI_ANALYSIS_ENABLED) return;

  try {
    const message = await getMessageById(messageId);
    if (!message) {
      logger.warn({ messageId }, "Message not found for analysis queue");
      return;
    }

    if (isAgeRestrictedMessage(message)) {
      const updated = await updateMessageAIAnalysis(
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
    lastError,
  };
}

/**
 * Starts the periodic recovery worker.
 *
 * FIX #4: Now also recovers messages stuck in `error/analysis_incomplete`
 * state (not just `pending`), and skips conversations that already have
 * individual fallback work in progress to avoid DB last-write-wins races.
 */
export function startPendingAIAnalysisWorker(
  client?: Client,
  eventBroadcaster?: EventBroadcaster,
): void {
  moderationClient = client;
  _redisEventBroadcaster = eventBroadcaster;
  if (!config.AI_ANALYSIS_ENABLED) return;

  setInterval(() => {
    // FIX #3 pattern: no async arrow — chain promises explicitly.
    Promise.all([
      getPendingConversationKeys(500),
      getConversationKeysWithIncompleteAnalysis(200),
    ])
      .then(([pendingKeys, incompleteKeys]) => {
        const now = Date.now();

        // FIX #9: Prune stale entries from state maps to prevent unbounded
        // memory growth from channels/threads that are no longer active.
        for (const [key, expiry] of conversationErrorCooldown) {
          if (now >= expiry) conversationErrorCooldown.delete(key);
        }
        for (const [key, startedAt] of conversationProcessing) {
          if (now - startedAt >= config.AI_ANALYSIS_PROCESSING_TIMEOUT_MS) {
            conversationProcessing.delete(key);
          }
        }

        // FIX #7: Prune stale in-flight counters for conversations that have
        // been idle longer than the processing timeout — prevents permanent
        // blocking if a decrement was missed due to an uncaught exception.
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

        // FIX #8: Build a set of keys already targeted for individual recovery
        // so the batch loop below skips them, preventing a race where batch
        // scheduling and individual scheduling collide on the same conversation.
        const incompleteKeySet = new Set(incompleteKeys);

        // --- Batch recovery for `pending` messages ---
        for (const key of pendingKeys) {
          if (conversationDebounceTimers.has(key)) continue;
          if (isConversationProcessingLocked(key)) continue;
          // FIX #4: skip if individual fallback already running for this conversation.
          if (individualInFlightByConversation.has(key)) continue;
          // FIX #8: skip if this conversation also needs individual recovery
          // (batch processing would conflict with in-flight individual work).
          if (incompleteKeySet.has(key)) continue;
          const cooldownUntil = conversationErrorCooldown.get(key);
          if (cooldownUntil && now < cooldownUntil) continue;
          scheduleConversationAnalysis(key);
        }

        // --- Individual recovery for `error/analysis_incomplete` messages ---
        // Circuit breaker check: no point iterating if individual CB is active.
        if (now >= individualCooldownUntil) {
          const promises: Promise<void>[] = [];
          for (const key of incompleteKeys) {
            // Skip if individual work is already running for this conversation.
            if (individualInFlightByConversation.has(key)) continue;
            // Skip if batch processing is running (it will fan-out if it finds more incomplete).
            if (isConversationProcessingLocked(key)) continue;

            promises.push(
              getIncompleteMessagesByConversation(key, 500)
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
