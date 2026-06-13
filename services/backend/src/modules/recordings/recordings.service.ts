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
  transcription: string | null;
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

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.cursor) {
      params.push(filters.cursor);
      conditions.push(`created_at < $${params.length}::numeric`);
    }
    if (filters?.channelId) {
      params.push(filters.channelId);
      conditions.push(`channel_id = $${params.length}`);
    }
    if (filters?.userId) {
      params.push(filters.userId);
      conditions.push(`user_id = $${params.length}`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await db.execute(sql`
      SELECT
        id, user_id, username, avatar_url, guild_id, channel_id,
        channel_name, filename, size_bytes, download_url,
        upload_status, upload_error, transcription, created_at, uploaded_at,
        COALESCE(size_bytes, 0) AS duration_bytes
      FROM voice_recordings
      ${sql.raw(whereClause)}
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
