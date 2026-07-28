/**
 * ai-analysis-worker.ts
 *
 * Two-pass AI moderation analysis worker (Piscina-compatible).
 *
 * ## Pipeline
 *
 *   Message → Layer 1 (fast classifier / heuristic)
 *              │
 *              ├─ clear match → final result (no LLM call)
 *              └─ ambiguous    → Layer 2 (LLM evaluator)
 *
 * Layer 1 runs synchronously in-memory. Layer 2 calls the LLM API via
 * the existing moderation pipeline (moderationOrchestrator).
 *
 * This file replaces the old `aiAnalysisWorker.ts` (archived) with a
 * simpler, unified worker that combines both layers.
 */

import { createChildLogger } from "@bete/shared/logger";
import { config } from "../../shared/config/config.js";
import { initializeDatabase } from "../../shared/database/drizzle.js";
import { messageStore } from "../message-capture/messageStore.js";
import type { MessageRecord } from "../message-capture/types.js";
import { buildConversationContext } from "./conversationContext.js";
import { classifyMessage } from "./fastClassifier.js";
import type { Layer1Result } from "./fastClassifier.js";
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
  | {
      type: "individual";
      message: MessageRecord;
      skipNormalAnalysis: boolean;
    };

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
// Two-pass pipeline
// ---------------------------------------------------------------------------

/**
 * Runs the two-pass pipeline on a single message:
 *   1. Layer 1 — fast heuristic classifier
 *   2. Layer 2 (if cascade) — LLM-based evaluator
 *
 * Returns the combined AnalysisResult.
 */
async function runTwoPassPipeline(
  message: MessageRecord,
  contextText: string,
  attachments: Awaited<ReturnType<typeof messageStore.getAttachmentsForMessages>>,
): Promise<AnalysisResult> {
  // ── Layer 1: Fast classifier ──────────────────────────────────────────
  const layer1Result: Layer1Result = classifyMessage(message);

  logger.debug(
    {
      messageId: message.id,
      layer1Flags: layer1Result.flags,
      cascade: layer1Result.cascadeToLayer2,
    },
    "Layer 1 classification complete",
  );

  if (!layer1Result.cascadeToLayer2) {
    // Layer 1 result is final — no LLM call needed
    return buildResultFromLayer1(message.id, layer1Result);
  }

  // ── Layer 2: LLM-based evaluation ─────────────────────────────────────
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
    return mergeLayers(layer1Result, llmResult);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.warn(
      { messageId: message.id, error: errorMsg },
      "Layer 2 (LLM) analysis failed — falling back to Layer 1 result",
    );
    // Fallback to Layer 1 with reduced confidence
    const fallback = buildResultFromLayer1(message.id, layer1Result);
    fallback.confidence = Math.min(fallback.confidence, 0.4);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Result builders
// ---------------------------------------------------------------------------

function buildResultFromLayer1(
  messageId: string,
  layer1: Layer1Result,
): AnalysisResult {
  const status = layer1.severity === "none" ? "clean" as const : "flagged" as const;
  const recommendedAction = mapSeverityToAction(layer1.severity);

  return {
    messageId,
    status,
    flags: layer1.flags,
    categories: layer1.flags,
    severity: layer1.severity === "high" ? "high" as const : layer1.severity === "medium" ? "medium" as const : "low" as const,
    confidence: layer1.confidence,
    recommendedAction,
    toxicityScore: layer1.toxicityScore,
    harmScore: layer1.harmScore,
    jailbreakScore: 0,
    safetyScore: 0,
    explanation: layer1.explanation,
  };
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

function mergeLayers(
  layer1: Layer1Result,
  llmResult: AnalysisResult,
): AnalysisResult {
  // Merge flags from both layers (deduplicate)
  const flagSet = new Set<string>([...layer1.flags, ...(llmResult.flags || [])]);

  // Take the max severity
  const severityOrder = ["none", "low", "medium", "high", "critical"] as const;
  const l1Idx = severityOrder.indexOf(layer1.severity);
  const l2Idx = severityOrder.indexOf(
    (llmResult.severity ?? "none") as (typeof severityOrder)[number],
  );
  const finalSeverity = severityOrder[Math.max(l1Idx, l2Idx)];

  // Combined confidence: weighted average favoring LLM when available
  const combinedConfidence =
    0.3 * layer1.confidence + 0.7 * (llmResult.confidence ?? 0.5);

  // Combine scores (take max per dimension)
  const toxicityScore = Math.max(
    layer1.toxicityScore,
    llmResult.toxicityScore ?? 0,
  );
  const harmScore = Math.max(layer1.harmScore, llmResult.harmScore ?? 0);

  return {
    messageId: llmResult.messageId,
    status: llmResult.status === "error" ? "error" as const : llmResult.status ?? "clean" as const,
    flags: Array.from(flagSet),
    categories: [
      ...new Set([
        ...layer1.flags,
        ...(llmResult.categories ?? []),
      ]),
    ],
    severity: finalSeverity,
    confidence: Math.min(combinedConfidence, 1),
    recommendedAction: llmResult.recommendedAction ?? mapSeverityToAction(finalSeverity),
    toxicityScore,
    harmScore,
    jailbreakScore: llmResult.jailbreakScore ?? 0,
    safetyScore: llmResult.safetyScore ?? 0,
    explanation: llmResult.explanation ?? layer1.explanation,
  };
}

function mapSeverityToAction(
  severity: "none" | "low" | "medium" | "high" | "critical",
): AnalysisResult["recommendedAction"] {
  switch (severity) {
    case "none":
      return "none";
    case "low":
      return "monitor";
    case "medium":
      return "review";
    case "high":
      return "delete";
    case "critical":
      return "escalate";
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

  // Run two-pass pipeline for each message
  const analysisResults = await Promise.all(
    messages.map(async (msg) => {
      try {
        return await runTwoPassPipeline(msg, contextText, attachments);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(
          { messageId: msg.id, error: errorMsg },
          "Two-pass pipeline failed for message",
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
    "Two-pass batch analysis complete",
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
  const { message, skipNormalAnalysis } = job;

  if (skipNormalAnalysis) {
    // Use Layer 1 only (fast)
    const layer1Result = classifyMessage(message);

    if (!layer1Result.cascadeToLayer2) {
      // Layer 1 is sufficient
      return {
        ok: true,
        results: [buildResultFromLayer1(message.id, layer1Result)],
      };
    }
  }

  // Full analysis (context + two-pass)
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
    const result = await runTwoPassPipeline(message, contextText, attachments);
    return { ok: true, results: [result] };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(
      { messageId: message.id, error: errorMsg },
      "Individual two-pass analysis failed",
    );
    return { ok: true, results: [buildFallbackResult(message.id, errorMsg)] };
  }
}