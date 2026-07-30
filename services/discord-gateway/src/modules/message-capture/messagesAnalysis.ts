import { createChildLogger, type Logger } from "@/shared/logger/index";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "../../shared/database/schema.js";
import { messagesTable } from "../../shared/database/schema.js";
import type { MessageRecord } from "../message-capture/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stringifyAIList(
  value: string[] | string | null | undefined,
): string | null {
  if (value == null) return null;
  return Array.isArray(value) ? JSON.stringify(value) : value;
}

// ─── AIAnalysisUpdate interface ──────────────────────────────────────────────

export interface AIAnalysisUpdate {
  status: "pending" | "processing" | "clean" | "warn" | "flagged" | "error";
  flags?: string | null;
  score?: number | null;
  analysis?: string | null;
  categories?: string[] | string | null;
  severity?: MessageRecord["ai_severity"] | null;
  confidence?: number | null;
  recommendedAction?: MessageRecord["ai_recommended_action"] | null;
  analyzedAt?: number | null;
  error?: string | null;
}

// ─── Shared field mapping helper ─────────────────────────────────────────────

function buildAIAnalysisSet(result: AIAnalysisUpdate, now?: number) {
  return {
    ai_status: result.status,
    ai_moderation_flags: result.flags ?? null,
    ai_moderation_score: result.score ?? null,
    ai_analysis: result.analysis ?? null,
    ai_categories: stringifyAIList(result.categories),
    ai_severity: result.severity ?? null,
    ai_confidence: result.confidence ?? result.score ?? null,
    ai_recommended_action: result.recommendedAction ?? null,
    ai_analyzed_at: result.analyzedAt ?? now ?? Date.now(),
    ai_error: result.error ?? null,
  };
}

// ─── MessagesAnalysis Class ───────────────────────────────────────────────────

export class MessagesAnalysis {
  private logger: Logger;

  constructor(
    protected db: NodePgDatabase<typeof schema>,
    _parentLogger?: Logger,
  ) {
    this.logger = createChildLogger("messages-analysis");
  }

  // ── AI Analysis Updates ─────────────────────────────────────────────────────

  async updateMessageAIAnalysis(
    messageId: string,
    result: AIAnalysisUpdate,
  ): Promise<MessageRecord | null> {
    this.logger.debug({ messageId }, "updateMessageAIAnalysis entry");
    try {
      await this.db
        .update(messagesTable)
        .set(buildAIAnalysisSet(result))
        .where(eq(messagesTable.id, messageId));

      const rows = await this.db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.id, messageId));

      return (rows[0] as MessageRecord) ?? null;
    } catch (error) {
      this.logger.error(
        {
          messageId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to update message AI analysis",
      );
      throw error;
    }
  }

  async updateMessagesAIAnalysisBulk(
    updates: Array<{ messageId: string; result: AIAnalysisUpdate }>,
  ): Promise<MessageRecord[]> {
    this.logger.debug(
      { count: updates.length },
      "updateMessagesAIAnalysisBulk entry",
    );
    if (updates.length === 0) return [];
    try {
      const now = Date.now();

      await this.db.transaction(async (tx) => {
        for (const { messageId, result } of updates) {
          await tx
            .update(messagesTable)
            .set(buildAIAnalysisSet(result, now))
            .where(eq(messagesTable.id, messageId));
        }
      });

      const ids = updates.map(({ messageId }) => messageId);
      const rows = await this.db
        .select()
        .from(messagesTable)
        .where(inArray(messagesTable.id, ids));

      return rows as MessageRecord[];
    } catch (error) {
      this.logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to bulk update messages AI analysis",
      );
      throw error;
    }
  }

  async getPendingAIAnalysisMessages(
    limit: number = 25,
  ): Promise<MessageRecord[]> {
    this.logger.debug({ limit }, "getPendingAIAnalysisMessages entry");
    try {
      const rows = await this.db
        .select()
        .from(messagesTable)
        .where(
          and(
            eq(messagesTable.ai_status, "pending"),
            isNull(messagesTable.deleted_at),
          ),
        )
        .orderBy(asc(messagesTable.created_at))
        .limit(limit);

      return rows as MessageRecord[];
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to get pending AI analysis messages",
      );
      throw error;
    }
  }

  // ── Conversation Context ────────────────────────────────────────────────────

  async getConversationContextBefore(input: {
    channelId: string;
    threadId: string | null;
    beforeCreatedAt: number;
    limit: number;
  }): Promise<MessageRecord[]> {
    this.logger.debug(
      { channelId: input.channelId, threadId: input.threadId },
      "getConversationContextBefore entry",
    );
    try {
      const { channelId, threadId, beforeCreatedAt, limit } = input;

      const locationCondition = threadId
        ? eq(messagesTable.thread_id, threadId)
        : eq(messagesTable.channel_id, channelId);

      const rows = await this.db
        .select()
        .from(messagesTable)
        .where(
          and(
            locationCondition,
            sql`${messagesTable.created_at} < ${beforeCreatedAt}`,
            isNull(messagesTable.deleted_at),
          ),
        )
        .orderBy(desc(messagesTable.created_at))
        .limit(limit);

      return (rows as MessageRecord[]).reverse();
    } catch (error) {
      this.logger.error(
        {
          channelId: input.channelId,
          threadId: input.threadId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to get conversation context before",
      );
      throw error;
    }
  }

  async getPendingMessagesByConversation(
    conversationKey: string,
    limit: number = 200,
  ): Promise<MessageRecord[]> {
    this.logger.debug(
      { conversationKey, limit },
      "getPendingMessagesByConversation entry",
    );
    try {
      const rows = await this.db.transaction(async (tx) => {
        const pendingIdsQuery = tx
          .select({ id: messagesTable.id })
          .from(messagesTable)
          .where(
            and(
              or(
                eq(messagesTable.thread_id, conversationKey),
                eq(messagesTable.channel_id, conversationKey),
              ),
              eq(messagesTable.ai_status, "pending"),
              isNull(messagesTable.deleted_at),
            ),
          )
          .orderBy(asc(messagesTable.created_at))
          .limit(limit)
          .for("update", { skipLocked: true });

        const pendingIds = (await pendingIdsQuery) as Array<{ id: string }>;

        if (pendingIds.length === 0) return [];

        return await tx
          .update(messagesTable)
          .set({ ai_status: "processing", ai_analyzed_at: Date.now() })
          .where(
            inArray(
              messagesTable.id,
              pendingIds.map((r) => r.id),
            ),
          )
          .returning();
      });

      return rows as MessageRecord[];
    } catch (error) {
      this.logger.error(
        {
          conversationKey,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to get pending messages by conversation",
      );
      throw error;
    }
  }

  async getPendingConversationKeys(limit: number = 500): Promise<string[]> {
    this.logger.debug({ limit }, "getPendingConversationKeys entry");
    try {
      const rows = (await this.db
        .selectDistinct({
          thread_id: messagesTable.thread_id,
          channel_id: messagesTable.channel_id,
        })
        .from(messagesTable)
        .where(
          and(
            eq(messagesTable.ai_status, "pending"),
            isNull(messagesTable.deleted_at),
          ),
        )
        .limit(limit)) as Array<{
        thread_id: string | null;
        channel_id: string;
      }>;

      const keys: string[] = [];
      for (const row of rows) {
        const key = row.thread_id || row.channel_id;
        if (key && !keys.includes(key)) {
          keys.push(key);
        }
      }

      return keys;
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to get pending conversation keys",
      );
      throw error;
    }
  }

  async getConversationKeysWithIncompleteAnalysis(
    limit: number = 200,
  ): Promise<string[]> {
    this.logger.debug(
      { limit },
      "getConversationKeysWithIncompleteAnalysis entry",
    );
    try {
      const rows = (await this.db
        .selectDistinct({
          thread_id: messagesTable.thread_id,
          channel_id: messagesTable.channel_id,
        })
        .from(messagesTable)
        .where(
          and(
            eq(messagesTable.ai_status, "error"),
            sql`${messagesTable.ai_moderation_flags} LIKE ${"%analysis_incomplete%"}`,
            sql`(${messagesTable.ai_moderation_flags} IS NULL OR ${messagesTable.ai_moderation_flags} NOT LIKE ${"%individual_analysis_exhausted%"})`,
            isNull(messagesTable.deleted_at),
          ),
        )
        .limit(limit)) as Array<{
        thread_id: string | null;
        channel_id: string;
      }>;

      const keys: string[] = [];
      for (const row of rows) {
        const key = row.thread_id || row.channel_id;
        if (key && !keys.includes(key)) {
          keys.push(key);
        }
      }
      return keys;
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to get conversation keys with incomplete analysis",
      );
      throw error;
    }
  }

  async getIncompleteMessagesByConversation(
    conversationKey: string,
    limit: number = 500,
  ): Promise<MessageRecord[]> {
    this.logger.debug(
      { conversationKey, limit },
      "getIncompleteMessagesByConversation entry",
    );
    try {
      const rows = await this.db.transaction(async (tx) => {
        const pendingIdsQuery = tx
          .select({ id: messagesTable.id })
          .from(messagesTable)
          .where(
            and(
              or(
                eq(messagesTable.thread_id, conversationKey),
                eq(messagesTable.channel_id, conversationKey),
              ),
              eq(messagesTable.ai_status, "error"),
              sql`${messagesTable.ai_moderation_flags} LIKE ${"%analysis_incomplete%"}`,
              sql`(${messagesTable.ai_moderation_flags} IS NULL OR ${messagesTable.ai_moderation_flags} NOT LIKE ${"%individual_analysis_exhausted%"})`,
              isNull(messagesTable.deleted_at),
            ),
          )
          .orderBy(asc(messagesTable.created_at))
          .limit(limit)
          .for("update", { skipLocked: true });

        const pendingIds = (await pendingIdsQuery) as Array<{ id: string }>;

        if (pendingIds.length === 0) return [];

        return await tx
          .update(messagesTable)
          .set({ ai_status: "processing", ai_analyzed_at: Date.now() })
          .where(
            inArray(
              messagesTable.id,
              pendingIds.map((r) => r.id),
            ),
          )
          .returning();
      });

      return rows as MessageRecord[];
    } catch (error) {
      this.logger.error(
        {
          conversationKey,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to get incomplete messages by conversation",
      );
      throw error;
    }
  }
}
