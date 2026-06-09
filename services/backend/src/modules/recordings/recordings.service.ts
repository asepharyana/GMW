import { createChildLogger } from "@bete/shared/logger";
import { sql } from "drizzle-orm";
import { getDatabase } from "../../shared/database/index.js";

const logger = createChildLogger("recordings.service");

export class RecordingsService {
  async getRecent(limit = 50) {
    const db = getDatabase();
    logger.debug({ limit }, "Fetching recent voice recordings");

    const { rows } = await db.execute(sql`
      SELECT
        id, user_id, username, avatar_url, guild_id, channel_id,
        channel_name, filename, size_bytes, download_url,
        upload_status, upload_error, created_at, uploaded_at
      FROM voice_recordings
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);

    return rows;
  }
}

export const recordingsService = new RecordingsService();
