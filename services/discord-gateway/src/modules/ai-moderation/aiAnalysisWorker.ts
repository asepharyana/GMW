import { config } from "../../shared/config/config.js";
import { initializeDatabase } from "../../shared/database/drizzle.js";
import { buildConversationContext } from "./conversationContext.js";
import { runModerationAnalysis } from "./llmModerationClient.js";
import {
  getAttachmentsForMessages,
  getConversationContextBefore,
  updateMessagesAIAnalysisBulk,
} from "../message-capture/messageStore.js";
import type { MessageRecord } from "../message-capture/types.js";

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

    const contextLines = await buildConversationContext({
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
      // If bulk update fails, we log it but don't fail the worker completely
      // so it can at least retry later without blowing up the circuit breaker if it was an isolated issue
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
