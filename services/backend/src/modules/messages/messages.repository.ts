import type { PageResult } from "@bete/shared";
import { pgAttachmentsTable, pgMessagesTable } from "@bete/shared";
import { createChildLogger } from "@bete/shared/logger";
import { and, desc, eq, inArray, lt, ne, type SQL } from "drizzle-orm";
import { getDatabase } from "../../shared/database/index.js";
import { mapMessageRow } from "../../shared/utils/messageMapper.js";
import type {
  MessageCreate,
  MessageQuery,
  MessageUpdate,
} from "./messages.schema.js";

const logger = createChildLogger("messages.repository");

export interface AttachmentResult {
  id: string;
  message_id: string;
  guild_id: string;
  channel_id: string;
  thread_id: string | null;
  user_id: string;
  filename: string;
  size: number;
  type: string;
  discord_url: string;
  uploaded_url: string | null;
  upload_status: string;
  upload_error: string | null;
  created_at: number;
  uploaded_at: number | null;
}

export class MessagesRepository {
  async findMany(
    query: MessageQuery,
  ): Promise<PageResult<ReturnType<typeof mapMessageRow>>> {
    const db = getDatabase();
    const limit = query.limit ?? 50;
    const conditions: SQL[] = [];

    if (query.guildId) {
      conditions.push(eq(pgMessagesTable.guild_id, query.guildId));
    }
    if (query.channelId) {
      conditions.push(eq(pgMessagesTable.channel_id, query.channelId));
    }
    if (query.userId) {
      conditions.push(eq(pgMessagesTable.user_id, query.userId));
    }
    if (query.status) {
      conditions.push(eq(pgMessagesTable.ai_status, query.status));
    }
    if (query.cursor) {
      conditions.push(lt(pgMessagesTable.created_at, Number(query.cursor)));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await db
      .select()
      .from(pgMessagesTable)
      .where(where)
      .orderBy(desc(pgMessagesTable.created_at))
      .limit(limit + 1);

    const data = rows
      .slice(0, limit)
      .map((r) => mapMessageRow(r as Record<string, unknown>));
    const nextCursor =
      rows.length > limit ? String(rows[limit].created_at) : null;

    logger.debug({ count: data.length, nextCursor }, "Found messages");
    return { data, nextCursor };
  }

  async findById(id: string) {
    const db = getDatabase();
    const [row] = await db
      .select()
      .from(pgMessagesTable)
      .where(eq(pgMessagesTable.id, id))
      .limit(1);

    if (!row) return null;
    return mapMessageRow(row as Record<string, unknown>);
  }

  async findByChannel(
    channelId: string,
    query: MessageQuery,
  ): Promise<PageResult<ReturnType<typeof mapMessageRow>>> {
    const db = getDatabase();
    const limit = query.limit ?? 50;
    const conditions: SQL[] = [eq(pgMessagesTable.channel_id, channelId)];

    if (query.cursor) {
      conditions.push(lt(pgMessagesTable.created_at, Number(query.cursor)));
    }

    const rows = await db
      .select()
      .from(pgMessagesTable)
      .where(and(...conditions))
      .orderBy(desc(pgMessagesTable.created_at))
      .limit(limit + 1);

    const data = rows
      .slice(0, limit)
      .map((r) => mapMessageRow(r as Record<string, unknown>));
    const nextCursor =
      rows.length > limit ? String(rows[limit].created_at) : null;

    return { data, nextCursor };
  }

  async create(data: MessageCreate) {
    const db = getDatabase();
    const id = crypto.randomUUID();

    const [row] = await db
      .insert(pgMessagesTable)
      .values({
        id,
        guild_id: data.guildId,
        channel_id: data.channelId,
        thread_id: data.threadId ?? null,
        user_id: data.userId,
        username: data.username,
        avatar_url: data.avatarUrl ?? null,
        content: data.content,
        edited_content: null,
        created_at: Date.now(),
        edited_at: null,
        deleted_at: null,
        type: data.type ?? "text",
        metadata: null,
        ai_status: "pending",
        is_reply: data.isReply ?? false,
        is_forward: data.isForward ?? false,
        is_crosspost: data.isCrosspost ?? false,
        reference_message_id: data.referenceMessageId ?? null,
        reference_channel_id: data.referenceChannelId ?? null,
        reference_guild_id: data.referenceGuildId ?? null,
      })
      .returning();

    return mapMessageRow(row as Record<string, unknown>);
  }

  async update(id: string, data: MessageUpdate) {
    const db = getDatabase();

    const setData: Partial<typeof pgMessagesTable.$inferInsert> = {};

    if (data.editedContent !== undefined) {
      setData.edited_content = data.editedContent;
    }
    if (data.aiStatus !== undefined) {
      setData.ai_status = data.aiStatus;
    }
    if (data.aiAnalysis !== undefined) {
      setData.ai_analysis = data.aiAnalysis;
    }
    if (data.aiCategories !== undefined) {
      setData.ai_categories = data.aiCategories;
    }
    if (data.aiSeverity !== undefined) {
      setData.ai_severity = data.aiSeverity;
    }
    if (data.aiConfidence !== undefined) {
      setData.ai_confidence = data.aiConfidence;
    }

    if (Object.keys(setData).length === 0) return this.findById(id);

    const [row] = await db
      .update(pgMessagesTable)
      .set(setData)
      .where(eq(pgMessagesTable.id, id))
      .returning();

    if (!row) return null;
    return mapMessageRow(row as Record<string, unknown>);
  }

  /**
   * Bulk-reset ai_status from 'error' to 'pending' so the DG recovery worker
   * picks them up on its next poll cycle.
   *
   * Accepts optional scope filters (guildId, channelId) or a list of explicit
   * message IDs. Returns the count of rows that were actually updated.
   */
  async reanalyzeErrorBatch(opts: {
    guildId?: string;
    channelId?: string;
    messageIds?: string[];
  }): Promise<number> {
    const db = getDatabase();
    const conditions: SQL[] = [eq(pgMessagesTable.ai_status, "error")];

    if (opts.messageIds && opts.messageIds.length > 0) {
      conditions.push(inArray(pgMessagesTable.id, opts.messageIds));
    }
    if (opts.guildId) {
      conditions.push(eq(pgMessagesTable.guild_id, opts.guildId));
    }
    if (opts.channelId) {
      conditions.push(eq(pgMessagesTable.channel_id, opts.channelId));
    }

    const result = await db
      .update(pgMessagesTable)
      .set({ ai_status: "pending" })
      .where(and(...conditions));

    const count = result.rowCount ?? 0;
    logger.info({ count, ...opts }, "Batch reanalyze triggered");
    return count;
  }

  /**
   * Mark a single message for re-analysis by resetting ai_status to 'pending'.
   * Skips messages already in 'pending' state to avoid write amplification.
   */
  async markForReanalysis(id: string): Promise<void> {
    const db = getDatabase();
    await db
      .update(pgMessagesTable)
      .set({ ai_status: "pending" })
      .where(
        and(
          eq(pgMessagesTable.id, id),
          ne(pgMessagesTable.ai_status, "pending"),
        ),
      );
  }

  /**
   * Retrieve messages flagged for review (ai_status IN ('warn', 'flagged')).
   * Optionally filtered by channelId, with configurable limit.
   */
  async getReviewMessages(
    channelId?: string,
    limit: number = 20,
  ): Promise<Record<string, unknown>[]> {
    const db = getDatabase();
    const conditions: SQL[] = [
      inArray(pgMessagesTable.ai_status, ["warn", "flagged"]),
    ];

    if (channelId) {
      conditions.push(eq(pgMessagesTable.channel_id, channelId));
    }

    const rows = await db
      .select({
        id: pgMessagesTable.id,
        guild_id: pgMessagesTable.guild_id,
        channel_id: pgMessagesTable.channel_id,
        user_id: pgMessagesTable.user_id,
        username: pgMessagesTable.username,
        avatar_url: pgMessagesTable.avatar_url,
        content: pgMessagesTable.content,
        type: pgMessagesTable.type,
        created_at: pgMessagesTable.created_at,
        ai_status: pgMessagesTable.ai_status,
        ai_severity: pgMessagesTable.ai_severity,
        ai_confidence: pgMessagesTable.ai_confidence,
        ai_analysis: pgMessagesTable.ai_analysis,
        is_reply: pgMessagesTable.is_reply,
        is_forward: pgMessagesTable.is_forward,
        is_crosspost: pgMessagesTable.is_crosspost,
        reference_message_id: pgMessagesTable.reference_message_id,
        reference_channel_id: pgMessagesTable.reference_channel_id,
        reference_guild_id: pgMessagesTable.reference_guild_id,
      })
      .from(pgMessagesTable)
      .where(and(...conditions))
      .orderBy(desc(pgMessagesTable.created_at))
      .limit(limit);

    return rows as unknown as Record<string, unknown>[];
  }

  async delete(id: string): Promise<boolean> {
    const db = getDatabase();
    const result = await db
      .delete(pgMessagesTable)
      .where(eq(pgMessagesTable.id, id));

    return (result.rowCount ?? 0) > 0;
  }

  async getAttachmentsByChannel(
    channelId: string,
    query: MessageQuery,
  ): Promise<PageResult<AttachmentResult>> {
    const db = getDatabase();
    const limit = query.limit ?? 50;
    const conditions: SQL[] = [eq(pgAttachmentsTable.channel_id, channelId)];

    if (query.cursor) {
      conditions.push(lt(pgAttachmentsTable.created_at, Number(query.cursor)));
    }

    const rows = await db
      .select()
      .from(pgAttachmentsTable)
      .where(and(...conditions))
      .orderBy(desc(pgAttachmentsTable.created_at))
      .limit(limit + 1);

    const data = rows.map((r) => ({
      id: String(r.id ?? ""),
      message_id: String(r.message_id ?? ""),
      guild_id: String(r.guild_id ?? ""),
      channel_id: String(r.channel_id ?? ""),
      thread_id: (r.thread_id as string | null) ?? null,
      user_id: String(r.user_id ?? ""),
      filename: String(r.filename ?? ""),
      size: Number(r.size ?? 0),
      type: String(r.type ?? ""),
      discord_url: String(r.discord_url ?? ""),
      uploaded_url: (r.uploaded_url as string | null) ?? null,
      upload_status: String(r.upload_status ?? "pending"),
      upload_error: (r.upload_error as string | null) ?? null,
      created_at: Number(r.created_at ?? 0),
      uploaded_at: (r.uploaded_at as number | null) ?? null,
    }));

    const nextCursor =
      data.length > limit ? String(data[limit].created_at) : null;
    const trimmed = data.slice(0, limit);

    return { data: trimmed, nextCursor };
  }
}

export const messagesRepository = new MessagesRepository();
