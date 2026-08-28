/**
 * ai-analysis-worker.ts
 *
 * AI moderation analysis worker (Piscina-compatible).
 *
 * ## Pipeline
 *
 *   Message batch → runModerationAnalysis (orchestrator) → LLM evaluator
 *   (with conversation context + media evidence) → per-message verdicts
 *
 * The orchestrator splits text-only vs media internally and runs both
 * paths in parallel with ONE LLM call per sub-batch — a 20-message text
 * batch costs 1 LLM call, not 20. Every message is judged by the LLM —
 * there is no regex/heuristic pre-classification. A failed LLM call yields
 * an explicit "error" status (never a heuristic verdict), and the recovery
 * worker retries it later.
 */

import { createChildLogger } from "@/shared/logger/index";
import { config } from "../../shared/config/config.js";
import { initializeDatabase } from "../../shared/database/drizzle.js";
import { messageStore } from "../message-capture/messageStore.js";
import type { MessageRecord } from "../message-capture/types.js";
import {
  buildConversationContext,
  buildLocationContext,
} from "./conversationContext.js";
import { buildConversationContextBlock } from "./moderationBuilders.js";
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
  score: number;
  analysis: string;
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
type IndividualOkResponse = {
  ok: true;
  results: AnalysisResult[];
};
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
// Result normalization
// ---------------------------------------------------------------------------

/** Clamp LLM-provided confidence to [0, 1]; default by status when missing. */
function normalizeConfidence(raw: number | undefined | null): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.min(Math.max(raw, 0), 1);
  }
  return 0.7;
}

/**
 * Content-aware fallback when the LLM returns an empty `analysis` field.
 * Quotes the actual message content so the log still explains WHAT was said
 * instead of a bare template like "Tidak ada indikasi pelanggaran."
 */
function buildFallbackAnalysis(message: MessageRecord, status: string): string {
  const raw = (message.edited_content ?? message.content ?? "").trim();
  const snippet = raw.length > 120 ? `${raw.slice(0, 120).trimEnd()}…` : raw;

  if (status === "clean") {
    return snippet
      ? `Tidak ada indikasi pelanggaran. Pesan: "${snippet}" dinilai wajar dalam konteks percakapan.`
      : "Tidak ada indikasi pelanggaran. Isi pesan dinilai wajar dalam konteks percakapan.";
  }
  return snippet
    ? `Pesan terindikasi melanggar kebijakan: "${snippet}".`
    : "Pesan terindikasi melanggar kebijakan (analisis AI).";
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
    score: 0,
    analysis: reason,
  };
}

/** Normalize one orchestrator result into the worker's AnalysisResult shape. */
function normalizeResult(
  result: AnalysisResult,
  message: MessageRecord | undefined,
): AnalysisResult {
  const status = result.status ?? "clean";
  return {
    messageId: result.messageId,
    status,
    flags: result.flags ?? [],
    categories: result.categories ?? [],
    severity: result.severity ?? "none",
    confidence: normalizeConfidence(result.confidence),
    recommendedAction: result.recommendedAction ?? "none",
    score: result.score ?? 0,
    analysis:
      result.analysis?.trim() ||
      (message
        ? buildFallbackAnalysis(message, status)
        : buildFallbackResult(result.messageId, "Missing message").analysis),
  };
}

// ---------------------------------------------------------------------------
// Batch handler — ONE orchestrator call for the whole batch
// ---------------------------------------------------------------------------

async function processBatch(job: {
  type: "batch";
  conversationKey: string;
  messages: MessageRecord[];
}): Promise<BatchOkResponse | BatchErrorResponse> {
  const { conversationKey, messages } = job;
  const firstMessage = messages[0];
  if (!firstMessage) return { ok: true, conversationKey, rows: [] };

  // Fetch context + attachments ONCE for the whole batch.
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
    maxAgeMs: config.AI_ANALYSIS_CONTEXT_MAX_AGE_MS,
    gapMs: config.AI_ANALYSIS_CONTEXT_GAP_MS,
  });
  const contextBlock = buildConversationContextBlock({
    location: buildLocationContext(messages),
    descriptor: contextLines.descriptor,
    lines: contextLines.lines,
  });

  const allTargetIds = messages.map((m) => m.id);
  const contextIds = contextBefore.map((m) => m.id);
  const attachments = await messageStore.getAttachmentsForMessages([
    ...allTargetIds,
    ...contextIds,
  ]);

  const analysisStart = Date.now();
  const moderationResult = await runModerationAnalysis({
    targets: messages,
    contextBlock,
    attachments,
  });
  const analysisDurationMs = Date.now() - analysisStart;

  const results = moderationResult.results.map((r) =>
    normalizeResult(
      r as unknown as AnalysisResult,
      messages.find((m) => m.id === r.messageId),
    ),
  );

  // Save results to DB
  const updates = results.map((result) => ({
    messageId: result.messageId,
    result: {
      status: result.status,
      flags: JSON.stringify(result.flags),
      score: result.score,
      analysis: result.analysis,
      categories: result.categories,
      severity: result.severity,
      confidence: result.confidence,
      recommendedAction: result.recommendedAction,
      analyzedAt: Date.now(),
      analysisDurationMs,
      error: result.status === "error" ? result.analysis : null,
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
    maxAgeMs: config.AI_ANALYSIS_CONTEXT_MAX_AGE_MS,
    gapMs: config.AI_ANALYSIS_CONTEXT_GAP_MS,
  });
  const contextBlock = buildConversationContextBlock({
    location: buildLocationContext([message]),
    descriptor: contextLines.descriptor,
    lines: contextLines.lines,
  });

  const contextIds = contextBefore.map((m) => m.id);
  const attachments = await messageStore.getAttachmentsForMessages([
    message.id,
    ...contextIds,
  ]);

  // Analysis uses the Discord CDN URL directly (archive-only uploader).
  // No upload-pending race guard: analysis proceeds regardless of upload
  // status, since discord_url is available immediately at capture time.

  try {
    const moderationResult = await runModerationAnalysis({
      targets: [message],
      contextBlock,
      attachments,
    });

    if (moderationResult.results.length === 0) {
      return {
        ok: true,
        results: [buildFallbackResult(message.id, "No LLM result returned")],
      };
    }

    const llmResult = moderationResult.results[0] as unknown as AnalysisResult;
    if (llmResult.status === "error") {
      return { ok: true, results: [llmResult] };
    }

    return {
      ok: true,
      results: [normalizeResult(llmResult, message)],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(
      { messageId: message.id, error: errorMsg },
      "Individual LLM analysis failed",
    );
    return { ok: true, results: [buildFallbackResult(message.id, errorMsg)] };
  }
}
