import { getPool } from "../../shared/database/index.js";
import { createChildLogger } from "@bete/shared/logger";
import type {
  MessageCreate,
  MessageQuery,
  MessageUpdate,
} from "./messages.schema.js";

const logger = createChildLogger("messages.repository");

export interface PageResult<T> {
  data: T[];
  nextCursor: string | null;
}

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
  async findMany(query: MessageQuery): Promise<PageResult<ReturnType<typeof mapMessageRow>>> {
    const pool = getPool();
    const limit = query.limit ?? 50;
    const clauses: string[] = [];
    const params: (string | number)[] = [];
    let p = 1;

    if (query.guildId) {
      clauses.push(`guild_id = $${p}`);
      params.push(query.guildId);
      p++;
    }
    if (query.channelId) {
      clauses.push(`channel_id = $${p}`);
      params.push(query.channelId);
      p++;
    }
    if (query.userId) {
      clauses.push(`user_id = $${p}`);
      params.push(query.userId);
      p++;
    }
    if (query.status) {
      clauses.push(`ai_status = $${p}`);
      params.push(query.status);
      p++;
    }
    if (query.cursor) {
      clauses.push(`created_at < $${p}`);
      params.push(Number(query.cursor));
      p++;
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const { rows } = await pool.query(
      `SELECT * FROM messages ${where} ORDER BY created_at DESC LIMIT $${p}`,
      [...params, limit + 1],
    );

    const data = rows.slice(0, limit).map(mapMessageRow);
    const nextCursor = rows.length > limit ? String(rows[limit].created_at) : null;

    logger.debug({ count: data.length, nextCursor }, "Found messages");
    return { data, nextCursor };
  }

  async findById(id: string) {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT * FROM messages WHERE id = $1`,
      [id],
    );

    if (rows.length === 0) return null;
    return mapMessageRow(rows[0] as Record<string, unknown>);
  }

  async findByChannel(
    channelId: string,
    query: MessageQuery,
  ): Promise<PageResult<ReturnType<typeof mapMessageRow>>> {
    const pool = getPool();
    const limit = query.limit ?? 50;
    const clauses: string[] = ["channel_id = $1"];
    const params: (string | number)[] = [channelId];
    let p = 2;

    if (query.cursor) {
      clauses.push(`created_at < $${p}`);
      params.push(Number(query.cursor));
      p++;
    }

    const { rows } = await pool.query(
      `SELECT * FROM messages ${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT $${p}`,
      [...params, limit + 1],
    );

    const data = rows.slice(0, limit).map(mapMessageRow);
    const nextCursor = rows.length > limit ? String(rows[limit].created_at) : null;

    return { data, nextCursor };
  }

  async create(data: MessageCreate) {
    const pool = getPool();
    const id = crypto.randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO messages (
        id, guild_id, channel_id, thread_id, user_id, username, avatar_url,
        content, edited_content, created_at, edited_at, deleted_at, type,
        metadata, ai_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        id,
        data.guildId,
        data.channelId,
        data.threadId ?? null,
        data.userId,
        data.username,
        data.avatarUrl ?? null,
        data.content,
        null,
        Date.now(),
        null,
        null,
        data.type,
        null,
        "pending",
      ],
    );

    return mapMessageRow(rows[0] as Record<string, unknown>);
  }

  async update(id: string, data: MessageUpdate) {
    const pool = getPool();

    // Map camelCase schema keys to snake_case DB columns
    const columnMap: Record<keyof MessageUpdate, string> = {
      editedContent: "edited_content",
      aiStatus: "ai_status",
      aiAnalysis: "ai_analysis",
      aiCategories: "ai_categories",
      aiSeverity: "ai_severity",
      aiConfidence: "ai_confidence",
    };

    const sets: string[] = [];
    const params: unknown[] = [];
    let p = 1;

    const keys = Object.keys(data) as (keyof MessageUpdate)[];
    for (const key of keys) {
      const val = data[key];
      if (val !== undefined) {
        sets.push(`${columnMap[key]} = $${p}`);
        params.push(val);
        p++;
      }
    }

    if (sets.length === 0) return this.findById(id);

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE messages SET ${sets.join(", ")} WHERE id = $${p} RETURNING *`,
      params,
    );

    if (rows.length === 0) return null;
    return mapMessageRow(rows[0] as Record<string, unknown>);
  }

  async delete(id: string): Promise<boolean> {
    const pool = getPool();
    const { rowCount } = await pool.query(
      `DELETE FROM messages WHERE id = $1`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  }

  async getAttachmentsByChannel(
    channelId: string,
    query: MessageQuery,
  ): Promise<PageResult<AttachmentResult>> {
    const pool = getPool();
    const limit = query.limit ?? 50;
    const clauses: string[] = ["channel_id = $1"];
    const params: (string | number)[] = [channelId];
    let p = 2;

    if (query.cursor) {
      clauses.push(`created_at < $${p}`);
      params.push(Number(query.cursor));
      p++;
    }

    const { rows } = await pool.query(
      `SELECT * FROM attachments ${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT $${p}`,
      [...params, limit + 1],
    );

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

    const nextCursor = data.length > limit ? String(data[limit].created_at) : null;
    const trimmed = data.slice(0, limit);

    return { data: trimmed, nextCursor };
  }
}

export const messagesRepository = new MessagesRepository();
