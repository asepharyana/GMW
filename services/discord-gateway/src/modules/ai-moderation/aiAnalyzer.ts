import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Client } from "discord.js-selfbot-v13";
import { AbortError } from "p-retry";
import { Piscina } from "piscina";
import { config } from "../../shared/config/config.js";
import { createChildLogger } from "@bete/shared/logger";
import { retryWithBackoff } from "@bete/shared/utils";
import type { EventBroadcaster } from "../event-broadcaster/index.js";
import { invalidateAnalyticsCache } from "../message-capture/analyticsStore.js";
import { isAgeRestrictedMetadata } from "../message-capture/messageMetadata.js";
import {
  getAttachmentsForMessages,
  getConversationContextBefore,
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
  MessageRecord,
  ModerationBroadcaster,
} from "../message-capture/types.js";
import { attemptAutoDeleteFlaggedMessage } from "./autoDeleteManager.js";
import { buildConversationContext } from "./conversationContext.js";
import { runModerationAnalysis } from "./llmModerationClient.js";
import {
  logModerationError,
} from "./responseLogger.js";

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

function recordConversationBatchFailure(conversationKey: string): void {
  const nextCount = (conversationConsecutiveErrors.get(conversationKey) ?? 0) + 1;
  conversationConsecutiveErrors.set(conversationKey, nextCount);

  if (nextCount >= MAX_CONSECUTIVE_ERRORS) {
    conversationErrorCooldown.set(
      conversationKey,
      Date.now() + CONVERSATION_CB_COOLDOWN_MS,
    );
    logger.warn(
      { conversationKey, consecutiveErrors: nextCount },
      "Conversation circuit breaker triggered due to consecutive batch errors",
    );
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
    // Rough token estimate: ~3 chars per token + metadata overhead
    const msgTokens = Math.ceil(content.length / 3) + tokensPerMessage;

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
 * Processes a single message directly in the main process (no IPC/worker
 * pool overhead).  Never called from the batch path.
 *
 * FIX #1+#5: Increments the individual circuit breaker on failure so a
 * sustained outage stops hammering the LLM endpoint.
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
  // Increment per-conversation counter so the recovery worker can see it.
  individualInFlightByConversation.set(
    conversationKey,
    (individualInFlightByConversation.get(conversationKey) ?? 0) + 1,
  );

  // Track whether all retries were exhausted specifically because the LLM
  // consistently returned no result for this message (vs. a transient error).
  let exhaustedOnIncomplete = false;

  try {
    const contextBefore = await getConversationContextBefore({
      channelId: message.channel_id,
      threadId: message.thread_id,
      beforeCreatedAt: message.created_at,
      limit: config.AI_ANALYSIS_CONTEXT_MESSAGE_LIMIT,
    });

    const contextLines = await buildConversationContext({
      contextBefore,
      targets: [message],
      maxTokens: config.AI_ANALYSIS_MAX_CONTEXT_TOKENS,
    });

    const contextIds = contextBefore.map((m) => m.id);
    const attachments = await getAttachmentsForMessages([
      messageId,
      ...contextIds,
    ]);

    const analysisResult = await retryWithBackoff(
      async () => {
        try {
          const result = await runModerationAnalysis({
            targets: [message],
            contextText: contextLines.join("\n"),
            attachments,
          });

          // If the LLM still dropped our only target, convert to a retryable
          // throw so backoff kicks in.  Track this so the catch block can
          // distinguish it from a transient network/parse failure.
          const stillIncomplete = result.results.some((r) =>
            r.flags.includes("analysis_incomplete"),
          );
          if (stillIncomplete) {
            exhaustedOnIncomplete = true;
            throw new Error(
              `LLM returned no result for single-target message ${messageId} — will retry with backoff`,
            );
          }

          // Got a real result — clear the incomplete flag.
          exhaustedOnIncomplete = false;

          return result;
        } catch (err: any) {
          // Propagate AbortError so outer retry is immediately cancelled on 429.
          if (err instanceof AbortError) {
            throw err;
          }
          if (
            err?.status === 429 ||
            err?.status === 401 ||
            err?.status === 403
          ) {
            throw new AbortError(err);
          }
          throw err;
        }
      },
      {
        retries: 0,
        minTimeout: 0,
        maxTimeout: 0,
      },
    );

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

    // Log individual analysis completion with comprehensive details
    const resultSummary = analysisResult.results[0];
    logModerationError(
      [messageId],
      config.AI_LLM_MODEL,
      new Error("Success"), // For logging purposes only
      {
        phase: "individual_fallback",
        status: resultSummary?.status,
        flags: resultSummary?.flags,
        severity: resultSummary?.severity,
        confidence: resultSummary?.confidence,
      },
    );

    // Reset individual CB on success.
    individualConsecutiveErrors = 0;

    logger.info(
      { messageId, status: analysisResult.results[0]?.status },
      "Individual fallback analysis complete",
    );
  } catch (error) {
    // FIX #5: individual failures now feed their own circuit breaker.
    individualConsecutiveErrors++;
    if (
      individualConsecutiveErrors >= config.AI_ANALYSIS_INDIVIDUAL_CB_THRESHOLD
    ) {
      individualCooldownUntil = Date.now() + INDIVIDUAL_COOLDOWN_MS;
      logger.warn(
        {
          threshold: config.AI_ANALYSIS_INDIVIDUAL_CB_THRESHOLD,
          cooldownUntil: new Date(individualCooldownUntil).toISOString(),
        },
        "Individual fallback circuit breaker triggered",
      );
    }

    lastError = error instanceof Error ? error.message : String(error);

    // Log error with responseLogger
    logModerationError([messageId], config.AI_LLM_MODEL, error as Error | string, {
      phase: "individual_fallback",
      conversationKey,
      exhaustedOnIncomplete,
    });

    // Infinite-loop prevention: if all retries were exhausted because the LLM
    // consistently dropped this specific message (not a transient error),
    // overwrite the DB entry with a terminal flag that the recovery query
    // does NOT match.  This permanently removes it from the recovery loop
    // while keeping it visible as an error in the dashboard.
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
          "Failed to write terminal exhausted status — message may re-enter recovery loop",
        );
      });
      logger.warn(
        { messageId },
        "Individual fallback exhausted — marked as individual_analysis_exhausted to stop recovery loop",
      );
    } else {
      // Transient failure (network/parse/DB): do NOT write terminal status.
      // Message stays as error/analysis_incomplete in DB and will be retried
      // by the recovery worker, subject to the individual circuit breaker.
      logger.error(
        {
          messageId,
          error: lastError,
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Individual fallback analysis failed (transient) — will be retried by recovery worker",
      );
    }
  } finally {
    activeIndividualRequests--;
    individualInFlight.delete(messageId);

    // Decrement per-conversation counter; remove key when it hits zero.
    const prev = individualInFlightByConversation.get(conversationKey) ?? 1;
    if (prev <= 1) {
      individualInFlightByConversation.delete(conversationKey);
    } else {
      individualInFlightByConversation.set(conversationKey, prev - 1);
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

  const newMessages = messages.filter((m) => !individualInFlight.has(m.id));
  if (newMessages.length === 0) return;

  logger.info(
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
      } else {
        individualInFlightByConversation.set(ck, prev - 1);
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
      conversationKey,
      messages,
    })) as AnalysisWorkerResponse;

    for (const row of result.rows) {
      broadcastAnalysisCompleted(row);
      scheduleAutoDelete(row);
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

    // Batch succeeded — but check for messages the LLM silently dropped.
    // Rows with flag "analysis_incomplete" were produced by parseModerationResponse
    // as synthetic errors; they must be re-processed individually.
    const incompleteMessages = messages.filter((msg) => {
      const row = result.rows.find((r) => r.id === msg.id);
      if (!row) {
        // The DB update row is missing entirely — treat as incomplete.
        return true;
      }
      const flags: string[] = (() => {
        try {
          return JSON.parse(row.ai_moderation_flags ?? "[]") as string[];
        } catch {
          return [];
        }
      })();
      return row.ai_status === "error" && flags.includes("analysis_incomplete");
    });

    if (incompleteMessages.length > 0) {
      logger.warn(
        {
          conversationKey,
          incompleteCount: incompleteMessages.length,
          incompleteIds: incompleteMessages.map((m) => m.id),
          totalBatchSize: messages.length,
        },
        "Batch returned incomplete results — fanning out to individual fallback queue",
      );
      enqueueIndividualFallbacks(incompleteMessages);
    }

    consecutiveErrors = 0; // Reset batch circuit breaker
    conversationErrorCooldown.delete(conversationKey);
    shouldScheduleNext = true;
  } catch (error) {
    consecutiveErrors++;
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      globalCooldownUntil = Date.now() + 60000;
      logger.warn("Global circuit breaker triggered due to consecutive errors");
    }

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

  const convoCooldown = conversationErrorCooldown.get(conversationKey) || 0;
  const activeCooldown = Math.max(convoCooldown, globalCooldownUntil);

  if (activeCooldown && Date.now() < activeCooldown) {
    if (!conversationDebounceTimers.has(conversationKey)) {
      const remaining = activeCooldown - Date.now();
      const timer = setTimeout(() => {
        conversationDebounceTimers.delete(conversationKey);
        scheduleConversationAnalysis(conversationKey);
      }, remaining + 500);
      conversationDebounceTimers.set(conversationKey, timer);
    }
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
      logger.info(
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
