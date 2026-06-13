import { createChildLogger } from "@bete/shared/logger";
import { sql } from "drizzle-orm";
import { getDatabase } from "../../shared/database/index.js";

const logger = createChildLogger("recordings.service");

export class RecordingsService {
  async getRecent(
    limit = 50,
    filters?: { channelId?: string; userId?: string },
  ) {
    logger.info({ limit }, "getRecent called");
    const db = getDatabase();
    logger.debug({ limit }, "Fetching recent voice recordings");

    const conditions: string[] = [];
    const params: unknown[] = [];

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
        upload_status, upload_error, created_at, uploaded_at,
        COALESCE(size_bytes, 0) AS duration_bytes
      FROM voice_recordings
      ${sql.raw(whereClause)}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);

    return rows;
  }
}

export const recordingsService = new RecordingsService();
