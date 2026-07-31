/**
 * ai-analysis-worker.ts
 *
 * AI moderation analysis worker (Piscina-compatible).
 *
 * ## Pipeline
 *
 *   Message → LLM evaluator (with conversation context + media evidence)
 *
 * Every message is judged by the LLM — there is no regex/heuristic
 * pre-classification. A failed LLM call yields an explicit "error" status
 * (never a heuristic verdict), and the recovery worker retries it later.
 */

import { createChildLogger } from "@/shared/logger/index";
import { config } from "../../shared/config/config.js";
import { initializeDatabase } from "../../shared/database/drizzle.js";
import { messageStore } from "../message-capture/messageStore.js";
import type { MessageRecord } from "../message-capture/types.js";
import { buildConversationContext } from "./conversationContext.js";
import { runModerationAnalysis } from "./moderationOrchestrator.js";

const logger = createChildLogger("ai-analysis-worker");

let dbInitialized = false;
let dbInitPromise: Promise<unknown> | null = null;

async function ensureDb(): Promise<void> {
  if (dbInitialized) return;
  if (!dbInitPromise) {
    dbInitPromise = initializeDatabase().then(() => {
      dbInitialized = true;
    });
  }
  await dbInitPromise;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnalysisInput {
  batch: MessageBatch;
  config: WorkerConfig;
}

export interface AnalysisResult {
  messageId: string;
  status: "clean" | "warn" | "flagged" | "error";
  flags: string[];
  categories: string[];
  severity: "none" | "low" | "medium" | "high" | "critical";
  confidence: number;
  recommendedAction:
    | "none"
    | "monitor"
    | "warn"
    | "review"
    | "delete"
    | "escalate";
  toxicityScore: number;
  harmScore: number;
  jailbreakScore: number;
  safetyScore: number;
  explanation: string;
  correctedFlags?: string[];
}

export interface WorkerConfig {
  aiLlmApiKey: string;
  aiLlmBaseUrl: string;
  aiLlmModel: string;
  aiLlmTimeoutMs: number;
}

export interface MessageBatch {
  conversationKey: string;
  messages: MessageRecord[];
  contextMessages: string[];
}

// Worker job types (Piscina entry point)
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

// ---------------------------------------------------------------------------
// Default export — Piscina worker entry point
// ---------------------------------------------------------------------------

export default async function workerRouter(
  job: WorkerJob,
): Promise<WorkerResponse> {
  if (!config.AI_LLM_API_KEY) {
    const errorMsg =
      "AI_LLM_API_KEY is missing from environment. Worker cannot process moderation requests without credentials.";
    logger.error({ error: errorMsg }, "AI_LLM_API_KEY is missing from environment");

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
    return {
      ok: false,
      results: [],
      error: `Database init failed: ${msg}`,
    };
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
// Single-pass LLM pipeline
// ---------------------------------------------------------------------------

/**
 * Runs the LLM moderation analysis on a single message.
 *
 * The LLM verdict IS the result — confidence, severity, flags and
 * explanation all come from the model. On failure the message is marked
 * "error" (explicit, retryable) instead of receiving a heuristic verdict.
 */
async function runLLMAnalysis(
  message: MessageRecord,
  contextText: string,
  attachments: Awaited<ReturnType<typeof messageStore.getAttachmentsForMessages>>,
): Promise<AnalysisResult> {
  try {
    const moderationResult = await runModerationAnalysis({
      targets: [message],
      contextText,
      attachments,
    });

    if (moderationResult.results.length === 0) {
      return buildFallbackResult(message.id, "No LLM result returned");
    }

    const llmResult = moderationResult.results[0] as unknown as AnalysisResult;
    if (llmResult.status === "error") {
      return llmResult;
    }

    return {
      messageId: llmResult.messageId,
      status: llmResult.status ?? "clean",
      flags: llmResult.flags ?? [],
      categories: llmResult.categories ?? [],
      severity: llmResult.severity ?? "none",
      confidence: normalizeConfidence(llmResult.confidence),
      recommendedAction: llmResult.recommendedAction ?? "none",
      toxicityScore: llmResult.toxicityScore ?? 0,
      harmScore: llmResult.harmScore ?? 0,
      jailbreakScore: llmResult.jailbreakScore ?? 0,
      safetyScore: llmResult.safetyScore ?? 0,
      explanation:
        llmResult.explanation?.trim() ||
        (llmResult.status === "clean"
          ? "Tidak ada indikasi pelanggaran."
          : "Pesan terindikasi melanggar kebijakan (analisis AI)."),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.warn(
      { messageId: message.id, error: errorMsg },
      "LLM analysis failed for message",
    );
    return buildFallbackResult(message.id, errorMsg);
  }
}

/** Clamp LLM-provided confidence to [0, 1]; default by status when missing. */
function normalizeConfidence(raw: number | undefined | null): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.min(Math.max(raw, 0), 1);
  }
  return 0.7;
}

function buildFallbackResult(
  messageId: string,
  reason: string,
): AnalysisResult {
  return {
    messageId,
    status: "error",
    flags: ["analysis_incomplete"],
    categories: ["analysis_incomplete"],
    severity: "none",
    confidence: 0,
    recommendedAction: "review",
    toxicityScore: 0,
    harmScore: 0,
    jailbreakScore: 0,
    safetyScore: 0,
    explanation: reason,
  };
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

  // Fetch context
  const contextBefore = await messageStore.getConversationContextBefore({
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
  const contextText = contextLines.join("\n");

  // Fetch attachments
  const targetIds = messages.map((m) => m.id);
  const contextIds = contextBefore.map((m) => m.id);
  const allMessageIds = [...targetIds, ...contextIds];
  const attachments =
    await messageStore.getAttachmentsForMessages(allMessageIds);

  // Run LLM analysis for each message
  const analysisResults = await Promise.all(
    messages.map(async (msg) => {
      try {
        return await runLLMAnalysis(msg, contextText, attachments);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(
          { messageId: msg.id, error: errorMsg },
          "LLM analysis failed for message",
        );
        return buildFallbackResult(msg.id, errorMsg);
      }
    }),
  );

  // Save results to DB
  const updates = analysisResults.map((result) => ({
    messageId: result.messageId,
    result: {
      status: result.status,
      flags: JSON.stringify(result.flags),
      score: result.toxicityScore,
      analysis: result.explanation,
      categories: result.categories,
      severity: result.severity,
      confidence: result.confidence,
      recommendedAction: result.recommendedAction,
      analyzedAt: Date.now(),
      error: result.status === "error" ? result.explanation : null,
    },
  }));

  let allRows: MessageRecord[] = [];
  if (updates.length > 0) {
    allRows = await messageStore.updateMessagesAIAnalysisBulk(updates);
  }

  logger.info(
    {
      total: messages.length,
      saved: allRows.length,
      conversationKey,
    },
    "LLM batch analysis complete",
  );

  return { ok: true, conversationKey, rows: allRows };
}

// ---------------------------------------------------------------------------
// Individual fallback handler
// ---------------------------------------------------------------------------

async function processIndividual(job: {
  type: "individual";
  message: MessageRecord;
  skipNormalAnalysis: boolean;
}): Promise<IndividualOkResponse | IndividualErrorResponse> {
  const { message } = job;

  // Full analysis (context + LLM). `skipNormalAnalysis` is accepted for
  // compatibility with the old two-pass protocol but always runs the LLM —
  // there is no heuristic path anymore.
  const contextBefore = await messageStore.getConversationContextBefore({
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
  const contextText = contextLines.join("\n");

  const contextIds = contextBefore.map((m) => m.id);
  const attachments = await messageStore.getAttachmentsForMessages([
    message.id,
    ...contextIds,
  ]);

  try {
    const result = await runLLMAnalysis(message, contextText, attachments);
    return { ok: true, results: [result] };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(
      { messageId: message.id, error: errorMsg },
      "Individual LLM analysis failed",
    );
    return { ok: true, results: [buildFallbackResult(message.id, errorMsg)] };
  }
}
