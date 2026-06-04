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
// Batch analysis (existing)
// ---------------------------------------------------------------------------

export interface AnalysisWorkerRequest {
  conversationKey: string;
  messages: MessageRecord[];
}

export type AnalysisWorkerResponse =
  | {
      ok: true;
      conversationKey: string;
      rows: MessageRecord[];
    }
  | {
      ok: false;
      conversationKey: string;
      rows: MessageRecord[];
      error: string;
    };

export default async function processAnalysisRequest({
  conversationKey,
  messages,
}: AnalysisWorkerRequest): Promise<AnalysisWorkerResponse> {
  if (!config.AI_LLM_API_KEY) {
    console.error(
      JSON.stringify({
        level: "FATAL",
        context: "aiAnalysisWorker",
        error:
          "AI_LLM_API_KEY is missing from environment. Force closing worker operation.",
        timestamp: new Date().toISOString(),
      }),
    );
    process.exit(1);
  }

  try {
    try {
      await ensureDb();
    } catch (dbError) {
      const msg = dbError instanceof Error ? dbError.message : String(dbError);
      return {
        ok: false,
        conversationKey,
        rows: [],
        error: `Database init failed: ${msg}`,
      };
    }

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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    const rows: MessageRecord[] = [];

    console.error(
      JSON.stringify({
        level: "ERROR",
        context: "aiAnalysisWorker",
        conversationKey,
        messageCount: messages.length,
        error: errorMessage,
        stack: errorStack,
        timestamp: new Date().toISOString(),
      }),
    );

    return { ok: false, conversationKey, rows, error: errorMessage };
  }
}

// ---------------------------------------------------------------------------
// Individual fallback analysis (offloaded from main thread)
// ---------------------------------------------------------------------------

export interface IndividualWorkerRequest {
  message: MessageRecord;
  /** Optional — if true, skip normal analysis and go straight to simple fallback */
  skipNormalAnalysis: boolean;
}

export type IndividualWorkerResponse =
  | {
      ok: true;
      results: AnalysisResult[];
    }
  | {
      ok: false;
      results: AnalysisResult[];
      error: string;
    };

/**
 * Processes a single message analysis in the worker thread.
 * Fetches context, attachments, runs LLM analysis (or simple fallback),
 * and returns the result — does NOT update DB or broadcast.
 *
 * The caller (main thread) handles DB writes, broadcasting, and auto-delete
 * scheduling.
 */
export async function processIndividualAnalysis({
  message,
  skipNormalAnalysis,
}: IndividualWorkerRequest): Promise<IndividualWorkerResponse> {
  if (!config.AI_LLM_API_KEY) {
    return { ok: false, results: [], error: "AI_LLM_API_KEY is missing" };
  }

  try {
    await ensureDb();

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
      // Go straight to simple text fallback (no JSON, no complex prompt)
      const simpleResult = await runSimpleTextFallback(message);
      results = [simpleResult];
    } else {
      // Try normal analysis first
      const moderationResult = await runModerationAnalysis({
        targets: [message],
        contextText: contextLines.join("\n"),
        attachments,
      });
      results = moderationResult.results;
    }

    return { ok: true, results };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { ok: false, results: [], error: errorMessage };
  }
}
