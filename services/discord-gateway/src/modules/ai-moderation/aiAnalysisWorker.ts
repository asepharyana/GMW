import { config } from "../../shared/config/config.js";
import { initializeDatabase } from "../../shared/database/drizzle.js";
import { buildConversationContext } from "./conversationContext.js";
import { runModerationAnalysis, runSimpleTextFallback } from "./llmModerationClient.js";
import {
  getAttachmentsForMessages,
  getConversationContextBefore,
  updateMessagesAIAnalysisBulk,
} from "../message-capture/messageStore.js";
import type { MessageRecord, AnalysisResult } from "../message-capture/types.js";

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

type BatchOkResponse = { ok: true; conversationKey: string; rows: MessageRecord[] };
type BatchErrorResponse = { ok: false; conversationKey: string; rows: MessageRecord[]; error: string };
type IndividualOkResponse = { ok: true; results: AnalysisResult[] };
type IndividualErrorResponse = { ok: false; results: AnalysisResult[]; error: string };

type WorkerResponse = BatchOkResponse | BatchErrorResponse | IndividualOkResponse | IndividualErrorResponse;

/**
 * Default export — Piscina worker entry point.
 * Routes to the correct handler based on `type` field.
 */
export default async function workerRouter(job: WorkerJob): Promise<WorkerResponse> {
  if (!config.AI_LLM_API_KEY) {
    console.error(
      JSON.stringify({
        level: "FATAL",
        context: "aiAnalysisWorker",
        error: "AI_LLM_API_KEY is missing from environment. Force closing worker operation.",
        timestamp: new Date().toISOString(),
      }),
    );
    process.exit(1);
  }

  try {
    await ensureDb();
  } catch (dbError) {
    const msg = dbError instanceof Error ? dbError.message : String(dbError);
    if (job.type === "batch") {
      return { ok: false, conversationKey: job.conversationKey, rows: [], error: `Database init failed: ${msg}` };
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
    console.error(JSON.stringify({
      level: "ERROR",
      context: "aiAnalysisWorker",
      type: job.type,
      error: errorMessage,
      stack: errorStack,
      timestamp: new Date().toISOString(),
    }));
    if (job.type === "batch") {
      return { ok: false, conversationKey: job.conversationKey, rows: [], error: errorMessage };
    }
    return { ok: false, results: [], error: errorMessage };
  }
}

// ---------------------------------------------------------------------------
// Batch handler
// ---------------------------------------------------------------------------

async function processBatch(job: { type: "batch"; conversationKey: string; messages: MessageRecord[] }): Promise<BatchOkResponse | BatchErrorResponse> {
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

  const result = await runModerationAnalysis({
    targets: messages,
    contextText: contextLines.join("\n"),
    attachments,
  });

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

  try {
    const rows = await updateMessagesAIAnalysisBulk(updates);
    return { ok: true, conversationKey, rows };
  } catch (dbErr) {
    throw new Error(
      `Failed to update DB: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Individual fallback handler (offloaded from main thread)
// ---------------------------------------------------------------------------

async function processIndividual(job: { type: "individual"; message: MessageRecord; skipNormalAnalysis: boolean }): Promise<IndividualOkResponse | IndividualErrorResponse> {
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
  const attachments = await getAttachmentsForMessages([message.id, ...contextIds]);

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
