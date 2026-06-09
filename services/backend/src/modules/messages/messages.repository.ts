import type { PageResult } from "@bete/shared";
import { createChildLogger } from "@bete/shared/logger";
import { and, desc, eq, inArray, lt, ne, type SQL } from "drizzle-orm";
import {
  bigint as pgBigint,
  integer as pgInteger,
  real as pgReal,
  pgTable,
  text as pgText,
} from "drizzle-orm/pg-core";
import { getDatabase } from "../../shared/database/index.js";
import type {
  MessageCreate,
  MessageQuery,
  MessageUpdate,
} from "./messages.schema.js";

const logger = createChildLogger("messages.repository");

/**
 * Local table definitions mirroring services/discord-gateway/src/shared/database/schema.ts.
 * These are query-building references only — schema source of truth remains in discord-gateway.
 */
const messages = pgTable("messages", {
  id: pgText("id").primaryKey(),
  guild_id: pgText("guild_id").notNull(),
  channel_id: pgText("channel_id").notNull(),
  thread_id: pgText("thread_id"),
  user_id: pgText("user_id").notNull(),
  username: pgText("username").notNull(),
  avatar_url: pgText("avatar_url"),
  content: pgText("content").notNull(),
  edited_content: pgText("edited_content"),
  created_at: pgBigint("created_at", { mode: "number" }).notNull(),
  edited_at: pgBigint("edited_at", { mode: "number" }),
  deleted_at: pgBigint("deleted_at", { mode: "number" }),
  type: pgText("type", {
    enum: ["text", "edited", "deleted"],
  })
    .notNull()
    .default("text"),
  metadata: pgText("metadata"),
  ai_status: pgText("ai_status", {
    enum: ["pending", "processing", "clean", "warn", "flagged", "error"],
  })
    .notNull()
    .default("pending"),
  ai_moderation_flags: pgText("ai_moderation_flags"),
  ai_moderation_score: pgReal("ai_moderation_score"),
  ai_analysis: pgText("ai_analysis"),
  ai_categories: pgText("ai_categories"),
  ai_severity: pgText("ai_severity", {
    enum: ["none", "low", "medium", "high", "critical"],
  }),
  ai_confidence: pgReal("ai_confidence"),
  ai_recommended_action: pgText("ai_recommended_action", {
    enum: ["none", "monitor", "warn", "review", "delete", "escalate"],
  }),
  ai_analyzed_at: pgBigint("ai_analyzed_at", { mode: "number" }),
  ai_error: pgText("ai_error"),
});

const attachments = pgTable("attachments", {
  id: pgText("id").primaryKey(),
  message_id: pgText("message_id").notNull(),
  guild_id: pgText("guild_id").notNull(),
  channel_id: pgText("channel_id").notNull(),
  thread_id: pgText("thread_id"),
  user_id: pgText("user_id").notNull(),
  filename: pgText("filename").notNull(),
  size: pgInteger("size").notNull(),
  type: pgText("type").notNull(),
  discord_url: pgText("discord_url").notNull(),
  uploaded_url: pgText("uploaded_url"),
  upload_status: pgText("upload_status", {
    enum: ["pending", "uploaded", "failed"],
  })
    .notNull()
    .default("pending"),
  upload_error: pgText("upload_error"),
  created_at: pgBigint("created_at", { mode: "number" }).notNull(),
  uploaded_at: pgBigint("uploaded_at", { mode: "number" }),
});

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

function mapMessageRow(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ""),
    guild_id: String(row.guild_id ?? ""),
    channel_id: String(row.channel_id ?? ""),
    thread_id: (row.thread_id as string | null) ?? null,
    user_id: String(row.user_id ?? ""),
    username: String(row.username ?? ""),
    avatar_url: (row.avatar_url as string | null) ?? null,
    content: String(row.content ?? ""),
    edited_content: (row.edited_content as string | null) ?? null,
    created_at: Number(row.created_at ?? 0),
    edited_at: (row.edited_at as number | null) ?? null,
    deleted_at: (row.deleted_at as number | null) ?? null,
    type: String(row.type ?? "text"),
    metadata: (row.metadata as string | null) ?? null,
    ai_status: (row.ai_status as string | null) ?? null,
    ai_moderation_flags: (row.ai_moderation_flags as string | null) ?? null,
    ai_moderation_score: (row.ai_moderation_score as number | null) ?? null,
    ai_analysis: (row.ai_analysis as string | null) ?? null,
    ai_categories: (row.ai_categories as string | null) ?? null,
    ai_severity: (row.ai_severity as string | null) ?? null,
    ai_confidence: (row.ai_confidence as number | null) ?? null,
    ai_recommended_action: (row.ai_recommended_action as string | null) ?? null,
    ai_analyzed_at: (row.ai_analyzed_at as number | null) ?? null,
    ai_error: (row.ai_error as string | null) ?? null,
  };
}

export class MessagesRepository {
  async findMany(
    query: MessageQuery,
  ): Promise<PageResult<ReturnType<typeof mapMessageRow>>> {
    const db = getDatabase();
    const limit = query.limit ?? 50;
    const conditions: SQL[] = [];

    if (query.guildId) {
      conditions.push(eq(messages.guild_id, query.guildId));
    }
    if (query.channelId) {
      conditions.push(eq(messages.channel_id, query.channelId));
    }
    if (query.userId) {
      conditions.push(eq(messages.user_id, query.userId));
    }
    if (query.status) {
      conditions.push(eq(messages.ai_status, query.status));
    }
    if (query.cursor) {
      conditions.push(lt(messages.created_at, Number(query.cursor)));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await db
      .select()
      .from(messages)
      .where(where)
      .orderBy(desc(messages.created_at))
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
      .from(messages)
      .where(eq(messages.id, id))
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
    const conditions: SQL[] = [eq(messages.channel_id, channelId)];

    if (query.cursor) {
      conditions.push(lt(messages.created_at, Number(query.cursor)));
    }

    const rows = await db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.created_at))
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
      .insert(messages)
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
      })
      .returning();

    return mapMessageRow(row as Record<string, unknown>);
  }

  async update(id: string, data: MessageUpdate) {
    const db = getDatabase();

    const setData: Partial<typeof messages.$inferInsert> = {};

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
      .update(messages)
      .set(setData)
      .where(eq(messages.id, id))
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
    const conditions: SQL[] = [eq(messages.ai_status, "error")];

    if (opts.messageIds && opts.messageIds.length > 0) {
      conditions.push(inArray(messages.id, opts.messageIds));
    }
    if (opts.guildId) {
      conditions.push(eq(messages.guild_id, opts.guildId));
    }
    if (opts.channelId) {
      conditions.push(eq(messages.channel_id, opts.channelId));
    }

    const result = await db
      .update(messages)
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
      .update(messages)
      .set({ ai_status: "pending" })
      .where(and(eq(messages.id, id), ne(messages.ai_status, "pending")));
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
      inArray(messages.ai_status, ["warn", "flagged"]),
    ];

    if (channelId) {
      conditions.push(eq(messages.channel_id, channelId));
    }

    const rows = await db
      .select({
        id: messages.id,
        guild_id: messages.guild_id,
        channel_id: messages.channel_id,
        user_id: messages.user_id,
        username: messages.username,
        avatar_url: messages.avatar_url,
        content: messages.content,
        type: messages.type,
        created_at: messages.created_at,
        ai_status: messages.ai_status,
        ai_severity: messages.ai_severity,
        ai_confidence: messages.ai_confidence,
        ai_analysis: messages.ai_analysis,
      })
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.created_at))
      .limit(limit);

    return rows as unknown as Record<string, unknown>[];
  }

  async delete(id: string): Promise<boolean> {
    const db = getDatabase();
    const result = await db.delete(messages).where(eq(messages.id, id));

    return (result.rowCount ?? 0) > 0;
  }

  async getAttachmentsByChannel(
    channelId: string,
    query: MessageQuery,
  ): Promise<PageResult<AttachmentResult>> {
    const db = getDatabase();
    const limit = query.limit ?? 50;
    const conditions: SQL[] = [eq(attachments.channel_id, channelId)];

    if (query.cursor) {
      conditions.push(lt(attachments.created_at, Number(query.cursor)));
    }

    const rows = await db
      .select()
      .from(attachments)
      .where(and(...conditions))
      .orderBy(desc(attachments.created_at))
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
