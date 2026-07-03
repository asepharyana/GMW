import { createChildLogger } from "@bete/shared/logger";
import { config } from "../../shared/config/config.js";
import { initializeDatabase } from "../../shared/database/drizzle.js";
import { extractMessageMediaEvidence } from "../message-capture/messageMetadata.js";
import {
  getAttachmentsForMessages,
  getConversationContextBefore,
  updateMessagesAIAnalysisBulk,
} from "../message-capture/messageStore.js";
import type {
  AnalysisResult,
  MessageRecord,
} from "../message-capture/types.js";
import { buildConversationContext } from "./conversationContext.js";
import {
  runModerationAnalysis,
  runSimpleTextFallback,
} from "./llmModerationClient.js";

const logger = createChildLogger("aiAnalysisWorker");

let dbInitialized = false;
let dbInitPromise: Promise<any> | null = null;

async function ensureDb() {
  if (dbInitialized) return;
  if (!dbInitPromise) {
    dbInitPromise = initializeDatabase().then(() => {
      dbInitialized = true;
    });
  }
  await dbInitPromise;
}

// ---------------------------------------------------------------------------
// Job types — the default export routes on `type`
// ---------------------------------------------------------------------------

type WorkerJob =
  | { type: "batch"; conversationKey: string; messages: MessageRecord[] }
  | { type: "individual"; message: MessageRecord; skipNormalAnalysis: boolean };

type BatchOkResponse = {
  ok: true;
  conversationKey: string;
  rows: MessageRecord[];
};
type BatchErrorResponse = {
  ok: false;
  conversationKey: string;
  rows: MessageRecord[];
  error: string;
};
type IndividualOkResponse = { ok: true; results: AnalysisResult[] };
type IndividualErrorResponse = {
  ok: false;
  results: AnalysisResult[];
  error: string;
};

type WorkerResponse =
  | BatchOkResponse
  | BatchErrorResponse
  | IndividualOkResponse
  | IndividualErrorResponse;

/**
 * Default export — Piscina worker entry point.
 * Routes to the correct handler based on `type` field.
 */
export default async function workerRouter(
  job: WorkerJob,
): Promise<WorkerResponse> {
  if (!config.AI_LLM_API_KEY) {
    const errorMsg =
      "AI_LLM_API_KEY is missing from environment. Worker cannot process moderation requests without credentials.";
    logger.error(
      { error: errorMsg },
      "AI_LLM_API_KEY is missing from environment",
    );

    if (job.type === "batch") {
      return {
        ok: false,
        conversationKey: job.conversationKey,
        rows: [],
        error: errorMsg,
      };
    }
    return { ok: false, results: [], error: errorMsg };
  }

  try {
    await ensureDb();
  } catch (dbError) {
    const msg = dbError instanceof Error ? dbError.message : String(dbError);
    if (job.type === "batch") {
      return {
        ok: false,
        conversationKey: job.conversationKey,
        rows: [],
        error: `Database init failed: ${msg}`,
      };
    }
    return { ok: false, results: [], error: `Database init failed: ${msg}` };
  }

  try {
    if (job.type === "batch") {
      return await processBatch(job);
    }
    return await processIndividual(job);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error(
      { type: job.type, error: errorMessage, stack: errorStack },
      "Worker job failed",
    );
    if (job.type === "batch") {
      return {
        ok: false,
        conversationKey: job.conversationKey,
        rows: [],
        error: errorMessage,
      };
    }
    return { ok: false, results: [], error: errorMessage };
  }
}

// ---------------------------------------------------------------------------
// Batch handler
// ---------------------------------------------------------------------------

async function processBatch(job: {
  type: "batch";
  conversationKey: string;
  messages: MessageRecord[];
}): Promise<BatchOkResponse | BatchErrorResponse> {
  const { conversationKey, messages } = job;
  const firstMessage = messages[0];
  if (!firstMessage) return { ok: true, conversationKey, rows: [] };

  const contextBefore = await getConversationContextBefore({
    channelId: firstMessage.channel_id,
    threadId: firstMessage.thread_id,
    beforeCreatedAt: firstMessage.created_at,
    limit: config.AI_ANALYSIS_CONTEXT_MESSAGE_LIMIT,
  });

  const contextLines = buildConversationContext({
    contextBefore,
    targets: messages,
    maxTokens: config.AI_ANALYSIS_MAX_CONTEXT_TOKENS,
  });

  const targetIds = messages.map((m) => m.id);
  const contextIds = contextBefore.map((m) => m.id);
  const allMessageIds = [...targetIds, ...contextIds];
  const attachments = await getAttachmentsForMessages(allMessageIds);

  // ── Split: text-only vs media ──────────────────────────────────────
  // Text-only analysis runs fast (single LLM call, no vision).
  // Media analysis is slow (download + vision → LLM).
  // Messages with BOTH text and media go into both arrays:
  //   - text batch → analyzes the text content immediately
  //   - media batch → analyzes images/video when ready
  // By splitting here, text results are saved to DB immediately
  // instead of waiting for media downloads to finish.
  // ────────────────────────────────────────────────────────────────────
  const textOnly: MessageRecord[] = [];
  const media: MessageRecord[] = [];

  for (const msg of messages) {
    const meta = msg.metadata
      ? extractMessageMediaEvidence(msg.metadata)
      : null;
    if (
      meta &&
      (meta.attachments.length > 0 ||
        meta.stickers.length > 0 ||
        meta.embeds.length > 0)
    ) {
      media.push(msg);
      // If the message also has text content, analyze it in the text batch too
      const rawContent = msg.edited_content ?? msg.content;
      if (rawContent.trim().length > 0) {
        textOnly.push(msg);
      }
    } else {
      textOnly.push(msg);
    }
  }

  const allRows: MessageRecord[] = [];

  // ── Parallel: text-only + media analysis run concurrently ──────────
  // Text-only → fast LLM call. Media → download + vision + LLM.
  // Running both in parallel means media downloads overlap with text LLM call.
  // Each path saves to DB as soon as its own results are ready.
  // ────────────────────────────────────────────────────────────────────
  const textPromise =
    textOnly.length > 0
      ? runModerationAnalysis({
          targets: textOnly,
          contextText: contextLines.join("\n"),
          attachments,
        }).then((result) => {
          const updates = result.results.map((analysisResult) => ({
            messageId: analysisResult.messageId,
            result: {
              status: analysisResult.status,
              flags: JSON.stringify(analysisResult.flags),
              score: analysisResult.score,
              analysis: analysisResult.analysis,
              categories: analysisResult.categories,
              severity: analysisResult.severity,
              confidence: analysisResult.confidence,
              recommendedAction: analysisResult.recommendedAction,
              analyzedAt: Date.now(),
              error: null,
            },
          }));
          if (updates.length > 0) {
            return updateMessagesAIAnalysisBulk(updates).then((rows) => {
              allRows.push(...rows);
              logger.info(
                { count: updates.length, conversationKey },
                "Text-only batch saved — media analysis still in progress",
              );
            });
          }
        })
      : Promise.resolve();

  const mediaPromise =
    media.length > 0
      ? runModerationAnalysis({
          targets: media,
          contextText: contextLines.join("\n"),
          attachments,
        }).then((result) => {
          const updates = result.results.map((analysisResult) => ({
            messageId: analysisResult.messageId,
            result: {
              status: analysisResult.status,
              flags: JSON.stringify(analysisResult.flags),
              score: analysisResult.score,
              analysis: analysisResult.analysis,
              categories: analysisResult.categories,
              severity: analysisResult.severity,
              confidence: analysisResult.confidence,
              recommendedAction: analysisResult.recommendedAction,
              analyzedAt: Date.now(),
              error: null,
            },
          }));
          if (updates.length > 0) {
            return updateMessagesAIAnalysisBulk(updates).then((rows) => {
              allRows.push(...rows);
            });
          }
        })
      : Promise.resolve();

  // Wait for both to complete
  await Promise.all([textPromise, mediaPromise]);

  logger.info(
    {
      total: messages.length,
      textOnly: textOnly.length,
      media: media.length,
      saved: allRows.length,
    },
    "Batch analysis complete",
  );

  return { ok: true, conversationKey, rows: allRows };
}

// ---------------------------------------------------------------------------
// Individual fallback handler (offloaded from main thread)
// ---------------------------------------------------------------------------

async function processIndividual(job: {
  type: "individual";
  message: MessageRecord;
  skipNormalAnalysis: boolean;
}): Promise<IndividualOkResponse | IndividualErrorResponse> {
  const { message, skipNormalAnalysis } = job;

  const contextBefore = await getConversationContextBefore({
    channelId: message.channel_id,
    threadId: message.thread_id,
    beforeCreatedAt: message.created_at,
    limit: config.AI_ANALYSIS_CONTEXT_MESSAGE_LIMIT,
  });

  const contextLines = buildConversationContext({
    contextBefore,
    targets: [message],
    maxTokens: config.AI_ANALYSIS_MAX_CONTEXT_TOKENS,
  });

  const contextIds = contextBefore.map((m) => m.id);
  const attachments = await getAttachmentsForMessages([
    message.id,
    ...contextIds,
  ]);

  let results: AnalysisResult[];

  if (skipNormalAnalysis) {
    const simpleResult = await runSimpleTextFallback(message);
    results = [simpleResult];
  } else {
    const moderationResult = await runModerationAnalysis({
      targets: [message],
      contextText: contextLines.join("\n"),
      attachments,
    });
    results = moderationResult.results;
  }

  return { ok: true, results };
}
