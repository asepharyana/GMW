import { createChildLogger } from "@bete/shared/logger";
import { sql } from "drizzle-orm";
import { getDatabase } from "../../shared/database/index.js";

const logger = createChildLogger("recordings.service");

export interface RecordingRow {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  guild_id: string | null;
  channel_id: string | null;
  channel_name: string | null;
  filename: string;
  size_bytes: number;
  download_url: string | null;
  upload_status: string;
  upload_error: string | null;
  created_at: number;
  uploaded_at: number | null;
  duration_bytes: number;
}

export interface PaginatedRecordings {
  items: RecordingRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

export class RecordingsService {
  async getRecent(
    limit = 50,
    filters?: { channelId?: string; userId?: string; cursor?: string },
  ): Promise<PaginatedRecordings> {
    logger.info({ limit }, "getRecent called");
    const db = getDatabase();

    const conditions: ReturnType<typeof sql>[] = [];

    if (filters?.cursor) {
      conditions.push(sql`created_at < ${filters.cursor}::numeric`);
    }
    if (filters?.channelId) {
      conditions.push(sql`channel_id = ${filters.channelId}`);
    }
    if (filters?.userId) {
      conditions.push(sql`user_id = ${filters.userId}`);
    }

    const whereClause =
      conditions.length > 0
        ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
        : sql``;

    const { rows } = await db.execute(sql`
      SELECT
        id, user_id, username, avatar_url, guild_id, channel_id,
        channel_name, filename, size_bytes, download_url,
        upload_status, upload_error, created_at, uploaded_at,
        COALESCE(size_bytes, 0) AS duration_bytes
      FROM voice_recordings
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limit + 1}
    `);

    const items = rows.slice(0, limit) as unknown as RecordingRow[];
    const hasMore = rows.length > limit;
    const nextCursor = hasMore ? String(items[items.length - 1]!.created_at) : null;

    return { items, nextCursor, hasMore };
  }

  async deleteById(id: string): Promise<void> {
    const db = getDatabase();
    await db.execute(sql`DELETE FROM voice_recordings WHERE id = ${id}`);
  }
}

export const recordingsService = new RecordingsService();
