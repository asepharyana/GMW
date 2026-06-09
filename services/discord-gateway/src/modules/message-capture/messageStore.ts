import { createChildLogger } from "@bete/shared/logger";
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
import { getDatabase } from "../../shared/database/drizzle.js";
import {
  attachmentsTable,
  messageReviewsTable,
  messagesTable,
  moderationActionsTable,
  retentionPoliciesTable,
} from "../../shared/database/schema.js";
import { decodeCursor, encodeCursor } from "../message-capture/pagination.js";
import type {
  AttachmentRecord,
  MessageQuery,
  MessageRecord,
  MessageReview,
  ModerationAction,
  PageResult,
  RetentionPolicy,
} from "../message-capture/types.js";

const logger = createChildLogger("message-store");

interface QueryBuilder<T = unknown> extends PromiseLike<T> {
  from(...args: unknown[]): QueryBuilder<T>;
  where(...args: unknown[]): QueryBuilder<T>;
  orderBy(...args: unknown[]): QueryBuilder<T>;
  limit(...args: unknown[]): QueryBuilder<T>;
  offset(...args: unknown[]): QueryBuilder<T>;
  values(...args: unknown[]): QueryBuilder<T>;
  onConflictDoNothing(...args: unknown[]): QueryBuilder<T>;
  returning(...args: unknown[]): QueryBuilder<T>;
  set(...args: unknown[]): QueryBuilder<T>;
  for(mode: string, options?: { skipLocked?: boolean }): QueryBuilder<T>;
  toSQL(): { sql: string; params: unknown[] };
}

interface MessageDatabase {
  select<T = unknown[]>(...args: unknown[]): QueryBuilder<T>;
  selectDistinct<T = unknown[]>(...args: unknown[]): QueryBuilder<T>;
  insert<T = unknown>(...args: unknown[]): QueryBuilder<T>;
  update(...args: unknown[]): QueryBuilder<unknown>;
  transaction<T>(callback: (tx: MessageDatabase) => Promise<T>): Promise<T>;
  execute(sql: unknown): Promise<any>;
}

function db(): MessageDatabase {
  return getDatabase() as unknown as MessageDatabase;
}

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

export { decodeCursor, encodeCursor } from "../message-capture/pagination.js";

export async function insertMessage(message: MessageRecord): Promise<void> {
  try {
    const database = db();
    await database.insert(messagesTable).values(message).onConflictDoNothing();
  } catch (error) {
    logger.error(
      {
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to insert message",
    );
    throw error;
  }
}

export async function upsertMessageForCapture(
  message: MessageRecord,
): Promise<boolean> {
  try {
    const database = db();
    const messageWithAIStatus = {
      ...message,
      ai_status: "pending" as const,
    };

    const rows = await database
      .insert<Array<{ id: string }>>(messagesTable)
      .values(messageWithAIStatus)
      .onConflictDoNothing()
      .returning({ id: messagesTable.id });

    return rows.length > 0;
  } catch (error) {
    logger.error(
      {
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to upsert message for capture",
    );
    throw error;
  }
}

export async function updateMessageAsEdited(
  messageId: string,
  editedContent: string,
  editedAt: number,
): Promise<void> {
  try {
    const database = db();
    await database
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
    logger.error(
      {
        messageId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to update message as edited",
    );
    throw error;
  }
}

export async function updateMessageAsDeleted(
  messageId: string,
  deletedAt: number,
): Promise<void> {
  try {
    const database = db();
    await database
      .update(messagesTable)
      .set({
        deleted_at: deletedAt,
        type: "deleted",
      })
      .where(eq(messagesTable.id, messageId));
  } catch (error) {
    logger.error(
      {
        messageId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to update message as deleted",
    );
    throw error;
  }
}

export async function getMessagesByChannel(
  channelId: string,
  limit: number = 50,
  offset: number = 0,
  guildId?: string,
): Promise<MessageRecord[]> {
  try {
    const database = db();
    const conditions: SQL[] = [
      or(
        eq(messagesTable.channel_id, channelId),
        eq(messagesTable.thread_id, channelId),
      ) as SQL,
    ];

    if (guildId) {
      conditions.push(eq(messagesTable.guild_id, guildId));
    }

    const rows = await database
      .select()
      .from(messagesTable)
      .where(and(...conditions))
      // P3: add secondary sort by id for stable pagination
      .orderBy(desc(messagesTable.created_at), desc(messagesTable.id))
      .limit(limit)
      .offset(offset);

    return rows as MessageRecord[];
  } catch (error) {
    logger.error(
      {
        channelId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to get messages by channel",
    );
    throw error;
  }
}

export async function insertAttachment(
  attachment: AttachmentRecord,
): Promise<void> {
  try {
    const database = db();
    await database
      .insert(attachmentsTable)
      .values(attachment)
      .onConflictDoNothing();
  } catch (error) {
    logger.error(
      {
        attachmentId: attachment.id,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to insert attachment",
    );
    throw error;
  }
}

export async function getAttachmentsByChannel(
  channelId: string,
  limit: number = 50,
  offset: number = 0,
  guildId?: string,
): Promise<AttachmentRecord[]> {
  try {
    const database = db();
    const conditions: SQL[] = [
      or(
        eq(attachmentsTable.channel_id, channelId),
        eq(attachmentsTable.thread_id, channelId),
      ) as SQL,
    ];

    if (guildId) {
      conditions.push(eq(attachmentsTable.guild_id, guildId));
    }

    const rows = await database
      .select()
      .from(attachmentsTable)
      .where(and(...conditions))
      .orderBy(desc(attachmentsTable.created_at))
      .limit(limit)
      .offset(offset);

    return rows as AttachmentRecord[];
  } catch (error) {
    logger.error(
      {
        channelId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to get attachments by channel",
    );
    throw error;
  }
}

export async function updateAttachmentAsUploaded(
  attachmentId: string,
  uploadedUrl: string,
  uploadedAt: number,
): Promise<void> {
  try {
    const database = db();
    await database
      .update(attachmentsTable)
      .set({
        uploaded_url: uploadedUrl,
        upload_status: "uploaded",
        uploaded_at: uploadedAt,
      })
      .where(eq(attachmentsTable.id, attachmentId));
  } catch (error) {
    logger.error(
      {
        attachmentId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to update attachment as uploaded",
    );
    throw error;
  }
}

export async function updateAttachmentDiscordUrl(
  attachmentId: string,
  discordUrl: string,
): Promise<void> {
  try {
    const database = db();
    await database
      .update(attachmentsTable)
      .set({ discord_url: discordUrl })
      .where(eq(attachmentsTable.id, attachmentId));
  } catch (error) {
    logger.error(
      {
        attachmentId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to update attachment Discord URL",
    );
    throw error;
  }
}

export async function updateAttachmentAsFailedUpload(
  attachmentId: string,
  error: string,
): Promise<void> {
  try {
    const database = db();
    await database
      .update(attachmentsTable)
      .set({
        upload_status: "failed",
        upload_error: error,
      })
      .where(eq(attachmentsTable.id, attachmentId));
  } catch (error) {
    logger.error(
      {
        attachmentId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to update attachment as failed",
    );
    throw error;
  }
}

interface AIAnalysisUpdate {
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

function stringifyAIList(
  value: string[] | string | null | undefined,
): string | null {
  if (value == null) return null;
  return Array.isArray(value) ? JSON.stringify(value) : value;
}

export async function updateMessageAIAnalysis(
  messageId: string,
  result: AIAnalysisUpdate,
): Promise<MessageRecord | null> {
  try {
    const database = db();
    await database
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

    const rows = await database
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.id, messageId));

    return (rows[0] as MessageRecord) ?? null;
  } catch (error) {
    logger.error(
      {
        messageId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to update message AI analysis",
    );
    throw error;
  }
}

export async function updateMessagesAIAnalysisBulk(
  updates: Array<{ messageId: string; result: AIAnalysisUpdate }>,
): Promise<MessageRecord[]> {
  if (updates.length === 0) return [];
  try {
    const database = db();
    const now = Date.now();

    await database.transaction(async (tx) => {
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

    // Fetch all updated messages in a single query
    const ids = updates.map(({ messageId }) => messageId);
    const rows = await database
      .select()
      .from(messagesTable)
      .where(inArray(messagesTable.id, ids));

    return rows as MessageRecord[];
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to bulk update messages AI analysis",
    );
    throw error;
  }
}

export async function getPendingAIAnalysisMessages(
  limit: number = 25,
): Promise<MessageRecord[]> {
  try {
    const database = db();
    const rows = await database
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
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to get pending AI analysis messages",
    );
    throw error;
  }
}

export async function getMessageById(
  messageId: string,
): Promise<MessageRecord | null> {
  try {
    const database = db();
    const rows = await database
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.id, messageId));

    return (rows[0] as MessageRecord) ?? null;
  } catch (error) {
    logger.error(
      {
        messageId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to get message by id",
    );
    throw error;
  }
}

export async function listMessages(
  query: MessageQuery,
): Promise<PageResult<MessageRecord>> {
  try {
    const database = db();
    const conditions = buildListMessageConditions(query);
    const rows = await database
      .select()
      .from(messagesTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(messagesTable.created_at), desc(messagesTable.id))
      .limit(query.limit + 1);

    return pageMessages(rows, query.limit);
  } catch (error) {
    logger.error(
      {
        query,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to list messages",
    );
    throw error;
  }
}

export async function listReviewMessages(
  query: Omit<MessageQuery, "status">,
): Promise<PageResult<MessageRecord>> {
  return listMessages({
    ...query,
    status: ["warn", "flagged", "error"],
  });
}

export async function getConversationContextBefore(input: {
  channelId: string;
  threadId: string | null;
  beforeCreatedAt: number;
  limit: number;
}): Promise<MessageRecord[]> {
  try {
    const database = db();
    const { channelId, threadId, beforeCreatedAt, limit } = input;

    // Query same thread if threadId exists, otherwise channelId
    const locationCondition = threadId
      ? eq(messagesTable.thread_id, threadId)
      : eq(messagesTable.channel_id, channelId);

    const rows = await database
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

    // Return in chronological order (oldest first)
    return (rows as MessageRecord[]).reverse();
  } catch (error) {
    logger.error(
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

export async function getPendingMessagesByConversation(
  conversationKey: string,
  limit: number = 200,
): Promise<MessageRecord[]> {
  try {
    const database = db();

    // conversationKey is either thread_id or channel_id
    // Query both to safely handle the key
    const rows = await database.transaction(async (tx) => {
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
    logger.error(
      {
        conversationKey,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to get pending messages by conversation",
    );
    throw error;
  }
}

export async function getPendingConversationKeys(
  limit: number = 500,
): Promise<string[]> {
  try {
    const database = db();

    // Get distinct conversation keys (thread_id or channel_id) for pending messages
    const rows = await database
      .selectDistinct<Array<{ thread_id: string | null; channel_id: string }>>({
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
      .limit(limit);

    const keys: string[] = [];
    for (const row of rows) {
      const key = row.thread_id || row.channel_id;
      if (key && !keys.includes(key)) {
        keys.push(key);
      }
    }

    return keys;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to get pending conversation keys",
    );
    throw error;
  }
}

export async function getAttachmentsForMessages(
  messageIds: string[],
): Promise<AttachmentRecord[]> {
  try {
    if (messageIds.length === 0) return [];
    const database = db();
    const rows = await database
      .select()
      .from(attachmentsTable)
      .where(inArray(attachmentsTable.message_id, messageIds));

    return rows as AttachmentRecord[];
  } catch (error) {
    logger.error(
      {
        messageIds,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to get attachments for messages",
    );
    throw error;
  }
}

export async function searchMessages(input: {
  query: string;
  channelId?: string;
  guildId?: string;
  limit?: number;
}): Promise<MessageRecord[]> {
  try {
    const { query, channelId, guildId, limit = 20 } = input;
    const database = db();

    const searchPattern = `%${query}%`;
    const conditions: (SQL | undefined)[] = [isNull(messagesTable.deleted_at)];

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

    const validConditions = conditions.filter((c): c is SQL => c !== undefined);

    const rows = await database
      .select()
      .from(messagesTable)
      .where(and(...validConditions))
      .orderBy(desc(messagesTable.created_at))
      .limit(limit);

    return rows as MessageRecord[];
  } catch (error) {
    logger.error(
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

/**
 * Returns distinct conversation keys (thread_id or channel_id) that have at
 * least one message stuck in `error` status with the `analysis_incomplete`
 * flag set.  Used by the recovery worker to re-feed those messages through
 * the individual-fallback queue.
 */
export async function getConversationKeysWithIncompleteAnalysis(
  limit: number = 200,
): Promise<string[]> {
  try {
    const database = db();
    const rows = await database
      .selectDistinct<Array<{ thread_id: string | null; channel_id: string }>>({
        thread_id: messagesTable.thread_id,
        channel_id: messagesTable.channel_id,
      })
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.ai_status, "error"),
          sql`${messagesTable.ai_moderation_flags} LIKE ${"%analysis_incomplete%"}`,
          // Exclude rows that have already been exhausted by the individual
          // fallback pipeline — prevents an infinite recovery loop if both
          // flags are ever written to the same row due to a bug.
          sql`(${messagesTable.ai_moderation_flags} IS NULL OR ${messagesTable.ai_moderation_flags} NOT LIKE ${"%individual_analysis_exhausted%"})`,
          isNull(messagesTable.deleted_at),
        ),
      )
      .limit(limit);

    const keys: string[] = [];
    for (const row of rows) {
      const key = row.thread_id || row.channel_id;
      if (key && !keys.includes(key)) {
        keys.push(key);
      }
    }
    return keys;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to get conversation keys with incomplete analysis",
    );
    throw error;
  }
}

/**
 * Returns MessageRecords for a given conversation key whose AI analysis is
 * stuck in `error` + `analysis_incomplete`.  Used to feed those records
 * directly into the individual-fallback queue without touching their status
 * (the individual pipeline will overwrite status on success).
 */
export async function getIncompleteMessagesByConversation(
  conversationKey: string,
  limit: number = 500,
): Promise<MessageRecord[]> {
  try {
    const database = db();
    const rows = await database.transaction(async (tx) => {
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
            // Same guard as getConversationKeysWithIncompleteAnalysis: exclude
            // rows that are already exhausted to prevent re-entry to recovery.
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
    logger.error(
      {
        conversationKey,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to get incomplete messages by conversation",
    );
    throw error;
  }
}

// Message Reviews CRUD
// ====================

export async function createMessageReview(
  review: Omit<MessageReview, "id" | "created_at">,
): Promise<MessageReview> {
  try {
    const database = db();
    const id = `review-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const created_at = Date.now();

    const rows = await database
      .insert<Array<MessageReview>>(messageReviewsTable)
      .values({
        ...review,
        id,
        created_at,
      })
      .returning();

    return rows[0] as MessageReview;
  } catch (error) {
    logger.error(
      {
        messageId: review.message_id,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to create message review",
    );
    throw error;
  }
}

export async function getMessageReview(
  id: string,
): Promise<MessageReview | null> {
  try {
    const database = db();
    const rows = await database
      .select()
      .from(messageReviewsTable)
      .where(eq(messageReviewsTable.id, id));

    return (rows[0] as MessageReview) || null;
  } catch (error) {
    logger.error(
      {
        reviewId: id,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to get message review",
    );
    throw error;
  }
}

export async function listMessageReviews(query: {
  guildId?: string;
  channelId?: string;
  status?: string[];
  cursor?: string;
  limit: number;
}): Promise<PageResult<MessageReview>> {
  try {
    const database = db();
    const limit = Math.max(1, Math.min(query.limit || 50, 100));
    const conditions: SQL[] = [];

    if (query.guildId) {
      conditions.push(eq(messageReviewsTable.guild_id, query.guildId));
    }
    if (query.channelId) {
      conditions.push(eq(messageReviewsTable.channel_id, query.channelId));
    }
    if (query.status && query.status.length > 0) {
      conditions.push(sql`${messageReviewsTable.status} in ${query.status}`);
    }

    const cursorData = decodeCursor(query.cursor);
    if (cursorData) {
      conditions.push(
        sql`(${messageReviewsTable.created_at} < ${cursorData.created_at} or (${messageReviewsTable.created_at} = ${cursorData.created_at} and ${messageReviewsTable.id} < ${cursorData.id}))`,
      );
    }

    const rows = await database
      .select()
      .from(messageReviewsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(
        desc(messageReviewsTable.created_at),
        desc(messageReviewsTable.id),
      )
      .limit(limit + 1);

    return pageRows<MessageReview>(rows, limit);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to list message reviews",
    );
    throw error;
  }
}

export async function updateMessageReview(
  id: string,
  updates: Partial<Omit<MessageReview, "id" | "created_at">>,
): Promise<MessageReview | null> {
  try {
    const database = db();
    const rows = (await database
      .update(messageReviewsTable)
      .set(updates)
      .where(eq(messageReviewsTable.id, id))
      .returning()) as MessageReview[];

    return rows[0] || null;
  } catch (error) {
    logger.error(
      {
        reviewId: id,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to update message review",
    );
    throw error;
  }
}

// Moderation Actions CRUD
// =======================

export async function createModerationAction(
  action: Omit<ModerationAction, "id" | "created_at">,
): Promise<ModerationAction> {
  try {
    const database = db();
    const id = `action-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const created_at = Date.now();

    const rows = await database
      .insert<Array<ModerationAction>>(moderationActionsTable)
      .values({
        ...action,
        id,
        created_at,
      })
      .returning();

    return rows[0] as ModerationAction;
  } catch (error) {
    logger.error(
      {
        guildId: action.guild_id,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to create moderation action",
    );
    throw error;
  }
}

export async function getModerationAction(
  id: string,
): Promise<ModerationAction | null> {
  try {
    const database = db();
    const rows = await database
      .select()
      .from(moderationActionsTable)
      .where(eq(moderationActionsTable.id, id));

    return (rows[0] as ModerationAction) || null;
  } catch (error) {
    logger.error(
      {
        actionId: id,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to get moderation action",
    );
    throw error;
  }
}

export async function listModerationActions(query: {
  guildId?: string;
  status?: string[];
  cursor?: string;
  limit: number;
}): Promise<PageResult<ModerationAction>> {
  try {
    const database = db();
    const limit = Math.max(1, Math.min(query.limit || 50, 100));
    const conditions: SQL[] = [];

    if (query.guildId) {
      conditions.push(eq(moderationActionsTable.guild_id, query.guildId));
    }
    if (query.status && query.status.length > 0) {
      conditions.push(sql`${moderationActionsTable.status} in ${query.status}`);
    }

    const cursorData = decodeCursor(query.cursor);
    if (cursorData) {
      conditions.push(
        sql`(${moderationActionsTable.created_at} < ${cursorData.created_at} or (${moderationActionsTable.created_at} = ${cursorData.created_at} and ${moderationActionsTable.id} < ${cursorData.id}))`,
      );
    }

    const rows = await database
      .select()
      .from(moderationActionsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(
        desc(moderationActionsTable.created_at),
        desc(moderationActionsTable.id),
      )
      .limit(limit + 1);

    return pageRows<ModerationAction>(rows, limit);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to list moderation actions",
    );
    throw error;
  }
}

export async function updateModerationAction(
  id: string,
  updates: Partial<Omit<ModerationAction, "id" | "created_at">>,
): Promise<ModerationAction | null> {
  try {
    const database = db();
    const rows = (await database
      .update(moderationActionsTable)
      .set(updates)
      .where(eq(moderationActionsTable.id, id))
      .returning()) as ModerationAction[];

    return rows[0] || null;
  } catch (error) {
    logger.error(
      {
        actionId: id,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to update moderation action",
    );
    throw error;
  }
}

// Retention Policies CRUD
// =======================

export async function getRetentionPolicy(
  guildId: string,
): Promise<RetentionPolicy | null> {
  try {
    const database = db();
    const rows = await database
      .select()
      .from(retentionPoliciesTable)
      .where(eq(retentionPoliciesTable.guild_id, guildId));

    return (rows[0] as RetentionPolicy) || null;
  } catch (error) {
    logger.error(
      {
        guildId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to get retention policy",
    );
    throw error;
  }
}

export async function upsertRetentionPolicy(
  policy: Omit<RetentionPolicy, "created_at" | "updated_at">,
): Promise<RetentionPolicy> {
  try {
    const database = db();
    const now = Date.now();
    const existing = await getRetentionPolicy(policy.guild_id);

    if (existing) {
      const rows = (await database
        .update(retentionPoliciesTable)
        .set({
          ...policy,
          updated_at: now,
        })
        .where(eq(retentionPoliciesTable.id, existing.id))
        .returning()) as RetentionPolicy[];

      return rows[0] as RetentionPolicy;
    }

    const id = `policy-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const rows = (await database
      .insert<Array<RetentionPolicy>>(retentionPoliciesTable)
      .values({
        ...policy,
        id,
        created_at: now,
        updated_at: now,
      })
      .returning()) as RetentionPolicy[];

    return rows[0] as RetentionPolicy;
  } catch (error) {
    logger.error(
      {
        guildId: policy.guild_id,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to upsert retention policy",
    );
    throw error;
  }
}

export async function getExpiredMessages(
  retentionDays: number,
): Promise<MessageRecord[]> {
  try {
    const database = db();
    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    const rows = await database
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
    logger.error(
      {
        retentionDays,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to get expired messages",
    );
    throw error;
  }
}

export async function revertStuckProcessingMessages(
  timeoutMs: number = 300000,
): Promise<number> {
  try {
    const database = db();
    const cutoffTime = Date.now() - timeoutMs;

    const rows = await database
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
      logger.info(
        {
          count: rows.length,
          messageIds: rows.map((r: { id: string }) => r.id),
        },
        "Reverted stuck processing messages back to pending",
      );
    }

    return Array.isArray(rows) ? rows.length : 0;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to revert stuck processing messages",
    );
    return 0;
  }
}
