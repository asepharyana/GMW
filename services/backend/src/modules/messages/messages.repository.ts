import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  like,
  lt,
  notInArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { config } from "../../shared/config/index.js";
import { getDatabase } from "../../shared/database/index.js";
import type { PageResult } from "../../shared/index.js";
import { pgAttachmentsTable, pgMessagesTable } from "../../shared/index.js";
import { createChildLogger } from "../../shared/logger/index.js";
import { mapMessageRow } from "../../shared/utils/messageMapper.js";
import type {
  MessageCreate,
  MessageQuery,
  MessageUpdate,
} from "./messages.schema.js";

/**
 * Thread/channel IDs to exclude from all message queries.
 * Messages in these threads (e.g. bot/selfbot spam) are skipped
 * both at capture time (discord-gateway) and when serving data
 * (backend API). Configured via EXCLUDED_THREAD_IDS and EXCLUDED_CHANNEL_IDS.
 */
const EXCLUDED_THREAD_IDS = config.EXCLUDED_THREAD_IDS;

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

type MessageRow = ReturnType<typeof mapMessageRow>;

export type { MessageRow };

/**
 * Build the NULL-safe "exclude spam threads" condition. Non-thread messages
 * (NULL thread_id) are always kept; thread messages are kept only when their
 * thread is not in the configured exclusion list.
 */
function excludeSpamThreads(): SQL | undefined {
  if (EXCLUDED_THREAD_IDS.length === 0) return undefined;
  return or(
    isNull(pgMessagesTable.thread_id),
    notInArray(pgMessagesTable.thread_id, EXCLUDED_THREAD_IDS),
  );
}

/** Normalize a raw attachment DB row to the API shape. */
function mapAttachmentRow(r: Record<string, unknown>): AttachmentResult {
  return {
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
  };
}

/** Select the first `limit + 1` rows so the caller can derive the next cursor. */
function cursorLimit(limit: number): number {
  return limit + 1;
}

export class MessagesRepository {
  async findMany(query: MessageQuery): Promise<PageResult<MessageRow>> {
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

    // Exclude spam threads (NULL-safe: non-thread messages are kept)
    const excludeThreads = excludeSpamThreads();
    if (excludeThreads) conditions.push(excludeThreads);

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await db
      .select()
      .from(pgMessagesTable)
      .where(where)
      .orderBy(desc(pgMessagesTable.created_at))
      .limit(cursorLimit(limit));

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

  /**
   * Edit history for a message: previous content snapshots (newest first).
   * Stored in message_edits by the gateway's message-capture module.
   */
  async getEditHistory(
    messageId: string,
  ): Promise<Array<{ old_content: string; edited_at: number }>> {
    const db = getDatabase();
    const result = await db.execute(sql`
      SELECT old_content, edited_at
      FROM message_edits
      WHERE message_id = ${messageId}
      ORDER BY edited_at DESC
      LIMIT 50
    `);
    return ((result.rows as Record<string, unknown>[]) || []).map((r) => ({
      old_content: String(r.old_content ?? ""),
      edited_at: Number(r.edited_at ?? 0),
    }));
  }

  async findByChannel(
    channelId: string,
    query: MessageQuery,
  ): Promise<PageResult<MessageRow>> {
    const db = getDatabase();
    const limit = query.limit ?? 50;
    const conditions: SQL[] = [eq(pgMessagesTable.channel_id, channelId)];

    if (query.cursor) {
      conditions.push(lt(pgMessagesTable.created_at, Number(query.cursor)));
    }

    // Exclude spam threads (NULL-safe)
    const excludeThreads = excludeSpamThreads();
    if (excludeThreads) conditions.push(excludeThreads);

    const rows = await db
      .select()
      .from(pgMessagesTable)
      .where(and(...conditions))
      .orderBy(desc(pgMessagesTable.created_at))
      .limit(cursorLimit(limit));

    const data = rows
      .slice(0, limit)
      .map((r) => mapMessageRow(r as Record<string, unknown>));
    const nextCursor =
      rows.length > limit ? String(rows[limit].created_at) : null;

    return { data, nextCursor };
  }

  /**
   * Async generator that yields messages ONE AT A TIME for WS streaming.
   * Each `.next()` runs its own bounded DB query (limit+1) advancing on the
   * `created_at` cursor, so memory stays flat and the caller can emit one WS
   * frame per message (no 50-row batch). Stops when a page returns < limit.
   */
  async *streamMany(
    query: MessageQuery,
    pageSize = 50,
  ): AsyncGenerator<MessageRow, void, unknown> {
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
    const excludeThreads = excludeSpamThreads();
    if (excludeThreads) conditions.push(excludeThreads);

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    let cursor: string | undefined = query.cursor;

    while (true) {
      const pageConditions = where ? [where] : [];
      if (cursor) {
        pageConditions.push(lt(pgMessagesTable.created_at, Number(cursor)));
      }
      const pageWhere =
        pageConditions.length > 0 ? and(...pageConditions) : undefined;

      const db = getDatabase();
      const rows = await db
        .select()
        .from(pgMessagesTable)
        .where(pageWhere)
        .orderBy(desc(pgMessagesTable.created_at))
        .limit(cursorLimit(pageSize));

      if (rows.length === 0) return;

      const hasMore = rows.length > pageSize;
      const pageRows = hasMore ? rows.slice(0, pageSize) : rows;

      for (const r of pageRows) {
        yield mapMessageRow(r as Record<string, unknown>);
      }

      if (!hasMore) return;
      cursor = String(rows[pageSize - 1].created_at);
    }
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

  async getImageMessages(
    guildId: string,
    limit: number = 50,
  ): Promise<PageResult<MessageRow>> {
    const db = getDatabase();

    // Subquery: find distinct message_ids from attachments with image MIME type
    const attachmentConditions: SQL[] = [
      eq(pgAttachmentsTable.guild_id, guildId),
      like(pgAttachmentsTable.type, "image/%"),
    ];
    // Exclude spam threads (NULL-safe for non-thread messages)
    const excludeThreads =
      EXCLUDED_THREAD_IDS.length > 0
        ? or(
            isNull(pgAttachmentsTable.thread_id),
            notInArray(pgAttachmentsTable.thread_id, EXCLUDED_THREAD_IDS),
          )
        : undefined;
    if (excludeThreads) attachmentConditions.push(excludeThreads);

    const imageMsgIds = db
      .select({ id: pgAttachmentsTable.message_id })
      .from(pgAttachmentsTable)
      .where(and(...attachmentConditions))
      .orderBy(desc(pgAttachmentsTable.created_at))
      .limit(cursorLimit(limit));

    // Fetch full message rows for those IDs
    const rows = await db
      .select()
      .from(pgMessagesTable)
      .where(inArray(pgMessagesTable.id, imageMsgIds))
      .orderBy(desc(pgMessagesTable.created_at))
      .limit(cursorLimit(limit));

    const data = rows
      .slice(0, limit)
      .map((r) => mapMessageRow(r as Record<string, unknown>));
    const nextCursor =
      rows.length > limit ? String(rows[limit].created_at) : null;

    logger.debug({ count: data.length, nextCursor }, "Found image messages");
    return { data, nextCursor };
  }

  async getAttachmentsByChannel(
    channelId: string,
    query: MessageQuery,
  ): Promise<PageResult<AttachmentResult>> {
    const db = getDatabase();
    const limit = query.limit ?? 50;
    const conditions: SQL[] = [eq(pgAttachmentsTable.channel_id, channelId)];

    // Detail view: narrow to the selected message so we don't show
    // everyone else's images from the same channel.
    if (query.messageId) {
      conditions.push(eq(pgAttachmentsTable.message_id, query.messageId));
    }

    if (query.cursor) {
      conditions.push(lt(pgAttachmentsTable.created_at, Number(query.cursor)));
    }

    const rows = await db
      .select()
      .from(pgAttachmentsTable)
      .where(and(...conditions))
      .orderBy(desc(pgAttachmentsTable.created_at))
      .limit(cursorLimit(limit));

    const data = rows.map((r) =>
      mapAttachmentRow(r as Record<string, unknown>),
    );

    // nextCursor derives from the fetched-but-untrimmed overflow row (index
    // `limit`), matching the other cursor-paginated queries.
    const nextCursor =
      rows.length > limit ? String(rows[limit].created_at) : null;
    const trimmed = data.slice(0, limit);

    return { data: trimmed, nextCursor };
  }

  /**
   * Per-hour message volume for the last `days` days, grouped by channel.
   * Powers the public Activity Heatmap (read-only, no write scope).
   * Returns a flat list of { channel_id, hour (0-23), count } buckets.
   */
  async getActivity(days = 30) {
    const db = getDatabase();
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const result = await db.execute(sql`
      SELECT
        m.channel_id,
        COALESCE(NULLIF((m.metadata::jsonb -> 'channel' ->> 'channelName'), ''), m.channel_id) AS channel_name,
        EXTRACT(HOUR FROM to_timestamp(m.created_at / 1000))::int AS hour,
        COUNT(*)::int AS c
      FROM messages m
      WHERE m.created_at >= ${since}
      GROUP BY m.channel_id, channel_name, hour
      ORDER BY channel_name, hour
    `);
    const rows = (result.rows as Record<string, unknown>[]) || [];
    return rows.map((r) => ({
      channelId: String(r.channel_id ?? "unknown"),
      channelName: String(r.channel_name ?? r.channel_id ?? "unknown"),
      hour: Number(r.hour ?? 0),
      count: Number(r.c ?? 0),
    }));
  }

  /**
   * Recent message edits across the server (evasion-signal tracker).
   * Public, read-only. Joins message_edits → messages for context.
   */
  async getRecentEdits(limit = 50, channelId?: string) {
    const db = getDatabase();
    const result = await db.execute(sql`
      SELECT
        e.id,
        e.message_id,
        e.old_content,
        e.edited_at,
        m.channel_id,
        COALESCE(NULLIF((m.metadata::jsonb -> 'channel' ->> 'channelName'), ''), m.channel_id) AS channel_name,
        m.username,
        COALESCE(m.edited_content, m.content) AS new_content
      FROM message_edits e
      JOIN messages m ON m.id = e.message_id
      ${channelId ? sql`WHERE m.channel_id = ${channelId}` : sql``}
      ORDER BY e.edited_at DESC
      LIMIT ${limit}
    `);
    const rows = (result.rows as Record<string, unknown>[]) || [];
    return rows.map((r) => ({
      id: String(r.id),
      message_id: String(r.message_id),
      old_content: r.old_content ? String(r.old_content) : "",
      new_content: r.new_content ? String(r.new_content) : "",
      edited_at: r.edited_at ? Number(r.edited_at) : 0,
      channel_id: r.channel_id ? String(r.channel_id) : null,
      channel_name: r.channel_name ? String(r.channel_name) : null,
      username: r.username ? String(r.username) : null,
    }));
  }

  /**
   * Distinct guilds present in the message archive (drives the guild picker).
   */
  async listGuilds(): Promise<
    Array<{ id: string; name: string; icon: string | null }>
  > {
    const db = getDatabase();
    const rows = await db
      .selectDistinct({ guild_id: pgMessagesTable.guild_id })
      .from(pgMessagesTable)
      .orderBy(pgMessagesTable.guild_id);
    return rows.map((row) => ({
      id: String(row.guild_id ?? ""),
      name: `Guild ${String(row.guild_id).slice(0, 8)}`,
      icon: null,
    }));
  }

  /**
   * Text channels for a guild, derived from the message archive
   * (drives the channel picker).
   */
  async listTextChannels(
    guildId: string,
  ): Promise<Array<{ id: string; name: string; type: "text" }>> {
    const db = getDatabase();
    const rows = await db
      .selectDistinct({ channel_id: pgMessagesTable.channel_id })
      .from(pgMessagesTable)
      .where(eq(pgMessagesTable.guild_id, guildId))
      .orderBy(pgMessagesTable.channel_id);
    return rows.map((row) => ({
      id: String(row.channel_id ?? ""),
      name: `Channel ${String(row.channel_id).slice(0, 8)}`,
      type: "text" as const,
    }));
  }
}

export const messagesRepository = new MessagesRepository();
