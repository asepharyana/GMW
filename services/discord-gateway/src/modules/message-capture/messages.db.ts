import { createChildLogger, type Logger } from "@bete/shared/logger";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "../../shared/database/schema.js";
import { messagesTable } from "../../shared/database/schema.js";
import { decodeCursor, encodeCursor } from "../message-capture/pagination.js";
import type {
  MessageQuery,
  MessageRecord,
  PageResult,
} from "../message-capture/types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function channelOrThreadCondition(channelId: string): SQL {
  return or(
    eq(messagesTable.channel_id, channelId),
    eq(messagesTable.thread_id, channelId),
  ) as SQL;
}

function buildListMessageConditions(query: MessageQuery): SQL[] {
  const conditions: SQL[] = [];

  if (query.guildId) {
    conditions.push(eq(messagesTable.guild_id, query.guildId));
  }

  if (query.channelId) {
    conditions.push(channelOrThreadCondition(query.channelId));
  }

  if (query.threadId) {
    conditions.push(eq(messagesTable.thread_id, query.threadId));
  }

  if (query.userId) {
    conditions.push(eq(messagesTable.user_id, query.userId));
  }

  if (query.status && query.status.length > 0) {
    conditions.push(sql`${messagesTable.ai_status} in ${query.status}`);
  }

  if (query.q) {
    const pattern = `%${query.q.toLowerCase()}%`;
    conditions.push(sql`lower(${messagesTable.content}) like ${pattern}`);
  }

  const cursorData = decodeCursor(query.cursor);
  if (cursorData) {
    conditions.push(
      sql`(${messagesTable.created_at} < ${cursorData.created_at} or (${messagesTable.created_at} = ${cursorData.created_at} and ${messagesTable.id} < ${cursorData.id}))`,
    );
  }

  return conditions;
}

function pageRows<T extends { created_at: number; id: string }>(
  rows: unknown[],
  limit: number,
): PageResult<T> {
  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit) as T[];
  const lastItem = data[data.length - 1];
  const nextCursor =
    hasMore && lastItem
      ? encodeCursor({ created_at: lastItem.created_at, id: lastItem.id })
      : null;

  return { data, nextCursor };
}

function pageMessages(
  rows: unknown[],
  limit: number,
): PageResult<MessageRecord> {
  return pageRows<MessageRecord>(rows, limit);
}

function stringifyAIList(
  value: string[] | string | null | undefined,
): string | null {
  if (value == null) return null;
  return Array.isArray(value) ? JSON.stringify(value) : value;
}

// ─── AIAnalysisUpdate interface ────────────────────────────────────────────

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

// ─── MessagesDb Class ──────────────────────────────────────────────────────

export class MessagesDb {
  private logger: Logger;

  constructor(
    private db: NodePgDatabase<typeof schema>,
    _parentLogger?: Logger,
  ) {
    this.logger = createChildLogger("messages-db");
  }

  // ── CRUD ──────────────────────────────────────────────────────────────

  async insertMessage(message: MessageRecord): Promise<void> {
    this.logger.debug({ messageId: message.id }, "insertMessage entry");
    try {
      await this.db
        .insert(messagesTable)
        .values(message as any)
        .onConflictDoNothing();
    } catch (error) {
      this.logger.error(
        {
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to insert message",
      );
      throw error;
    }
  }

  async upsertMessageForCapture(message: MessageRecord): Promise<boolean> {
    this.logger.debug(
      { messageId: message.id },
      "upsertMessageForCapture entry",
    );
    try {
      const messageWithAIStatus = {
        ...message,
        ai_status: "pending" as const,
      };

      const rows = await this.db
        .insert(messagesTable)
        .values(messageWithAIStatus as any)
        .onConflictDoNothing()
        .returning({ id: messagesTable.id });

      return rows.length > 0;
    } catch (error) {
      this.logger.error(
        {
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to upsert message for capture",
      );
      throw error;
    }
  }

  async updateMessageAsEdited(
    messageId: string,
    editedContent: string,
    editedAt: number,
  ): Promise<void> {
    this.logger.debug({ messageId }, "updateMessageAsEdited entry");
    try {
      await this.db
        .update(messagesTable)
        .set({
          edited_content: editedContent,
          edited_at: editedAt,
          type: "edited",
          ai_status: "pending",
          ai_moderation_flags: null,
          ai_moderation_score: null,
          ai_analysis: null,
          ai_categories: null,
          ai_severity: null,
          ai_confidence: null,
          ai_recommended_action: null,
          ai_analyzed_at: null,
          ai_error: null,
        })
        .where(eq(messagesTable.id, messageId));
    } catch (error) {
      this.logger.error(
        {
          messageId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to update message as edited",
      );
      throw error;
    }
  }

  async updateMessageAsDeleted(
    messageId: string,
    deletedAt: number,
  ): Promise<void> {
    this.logger.debug({ messageId }, "updateMessageAsDeleted entry");
    try {
      await this.db
        .update(messagesTable)
        .set({
          deleted_at: deletedAt,
          type: "deleted",
        })
        .where(eq(messagesTable.id, messageId));
    } catch (error) {
      this.logger.error(
        {
          messageId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to update message as deleted",
      );
      throw error;
    }
  }

  async getMessagesByChannel(
    channelId: string,
    limit: number = 50,
    offset: number = 0,
    guildId?: string,
  ): Promise<MessageRecord[]> {
    this.logger.debug(
      { channelId, limit, offset, guildId },
      "getMessagesByChannel entry",
    );
    try {
      const conditions: SQL[] = [
        or(
          eq(messagesTable.channel_id, channelId),
          eq(messagesTable.thread_id, channelId),
        ) as SQL,
      ];

      if (guildId) {
        conditions.push(eq(messagesTable.guild_id, guildId));
      }

      const rows = await this.db
        .select()
        .from(messagesTable)
        .where(and(...conditions))
        .orderBy(desc(messagesTable.created_at), desc(messagesTable.id))
        .limit(limit)
        .offset(offset);

      return rows as MessageRecord[];
    } catch (error) {
      this.logger.error(
        {
          channelId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to get messages by channel",
      );
      throw error;
    }
  }

  async getMessageById(messageId: string): Promise<MessageRecord | null> {
    this.logger.debug({ messageId }, "getMessageById entry");
    try {
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
        "Failed to get message by id",
      );
      throw error;
    }
  }

  // ── AI Analysis ───────────────────────────────────────────────────────

  async updateMessageAIAnalysis(
    messageId: string,
    result: AIAnalysisUpdate,
  ): Promise<MessageRecord | null> {
    this.logger.debug({ messageId }, "updateMessageAIAnalysis entry");
    try {
      await this.db
        .update(messagesTable)
        .set({
          ai_status: result.status,
          ai_moderation_flags: result.flags ?? null,
          ai_moderation_score: result.score ?? null,
          ai_analysis: result.analysis ?? null,
          ai_categories: stringifyAIList(result.categories),
          ai_severity: result.severity ?? null,
          ai_confidence: result.confidence ?? result.score ?? null,
          ai_recommended_action: result.recommendedAction ?? null,
          ai_analyzed_at: result.analyzedAt ?? Date.now(),
          ai_error: result.error ?? null,
        })
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
            .set({
              ai_status: result.status,
              ai_moderation_flags: result.flags ?? null,
              ai_moderation_score: result.score ?? null,
              ai_analysis: result.analysis ?? null,
              ai_categories: stringifyAIList(result.categories),
              ai_severity: result.severity ?? null,
              ai_confidence: result.confidence ?? result.score ?? null,
              ai_recommended_action: result.recommendedAction ?? null,
              ai_analyzed_at: result.analyzedAt ?? now,
              ai_error: result.error ?? null,
            })
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

  // ── Listing / Pagination ──────────────────────────────────────────────

  async listMessages(query: MessageQuery): Promise<PageResult<MessageRecord>> {
    this.logger.debug({ query }, "listMessages entry");
    try {
      const conditions = buildListMessageConditions(query);
      const rows = await this.db
        .select()
        .from(messagesTable)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(messagesTable.created_at), desc(messagesTable.id))
        .limit(query.limit + 1);

      return pageMessages(rows, query.limit);
    } catch (error) {
      this.logger.error(
        {
          query,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to list messages",
      );
      throw error;
    }
  }

  async listReviewMessages(
    query: Omit<MessageQuery, "status">,
  ): Promise<PageResult<MessageRecord>> {
    return this.listMessages({
      ...query,
      status: ["warn", "flagged", "error"],
    });
  }

  // ── Conversation Context ──────────────────────────────────────────────

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

  // ── Conversation Keys ─────────────────────────────────────────────────

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

  // ── Search ────────────────────────────────────────────────────────────

  async searchMessages(input: {
    query: string;
    channelId?: string;
    guildId?: string;
    limit?: number;
  }): Promise<MessageRecord[]> {
    this.logger.debug({ query: input.query }, "searchMessages entry");
    try {
      const { query, channelId, guildId, limit = 20 } = input;

      const searchPattern = `%${query}%`;
      const conditions: (SQL | undefined)[] = [
        isNull(messagesTable.deleted_at),
      ];

      if (guildId) {
        conditions.push(eq(messagesTable.guild_id, guildId));
      }

      if (channelId) {
        conditions.push(channelOrThreadCondition(channelId));
      }

      conditions.push(
        or(
          sql`${messagesTable.content} LIKE ${searchPattern}`,
          sql`${messagesTable.edited_content} LIKE ${searchPattern}`,
        ),
      );

      const validConditions = conditions.filter(
        (c): c is SQL => c !== undefined,
      );

      const rows = await this.db
        .select()
        .from(messagesTable)
        .where(and(...validConditions))
        .orderBy(desc(messagesTable.created_at))
        .limit(limit);

      return rows as MessageRecord[];
    } catch (error) {
      this.logger.error(
        {
          query: input.query,
          channelId: input.channelId,
          guildId: input.guildId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to search messages",
      );
      throw error;
    }
  }

  // ── Retention / Recovery ──────────────────────────────────────────────

  async getExpiredMessages(retentionDays: number): Promise<MessageRecord[]> {
    this.logger.debug({ retentionDays }, "getExpiredMessages entry");
    try {
      const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

      const rows = await this.db
        .select()
        .from(messagesTable)
        .where(
          and(
            sql`${messagesTable.created_at} < ${cutoffTime}`,
            isNull(messagesTable.deleted_at),
          ),
        )
        .limit(1000);

      return rows as MessageRecord[];
    } catch (error) {
      this.logger.error(
        {
          retentionDays,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to get expired messages",
      );
      throw error;
    }
  }

  async revertStuckProcessingMessages(
    timeoutMs: number = 300000,
  ): Promise<number> {
    this.logger.debug({ timeoutMs }, "revertStuckProcessingMessages entry");
    try {
      const cutoffTime = Date.now() - timeoutMs;

      const rows = await this.db
        .update(messagesTable)
        .set({ ai_status: "pending", ai_analyzed_at: null })
        .where(
          and(
            eq(messagesTable.ai_status, "processing"),
            sql`${messagesTable.ai_analyzed_at} < ${cutoffTime}`,
          ),
        )
        .returning({ id: messagesTable.id });

      if (Array.isArray(rows) && rows.length > 0) {
        this.logger.info(
          {
            count: rows.length,
            messageIds: rows.map((r: { id: string }) => r.id),
          },
          "Reverted stuck processing messages back to pending",
        );
      }

      return Array.isArray(rows) ? rows.length : 0;
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to revert stuck processing messages",
      );
      return 0;
    }
  }
}
