import { sql } from "drizzle-orm";
import { getDatabase } from "../../shared/database/index.js";
import { config } from "../../shared/config/index.js";
import { createChildLogger } from "../../shared/logger/index.js";

const logger = createChildLogger("analysis.service");

export interface AnalysisSearchQuery {
  q?: string;
  channelId?: string;
  limit?: number;
}

export class AnalysisService {
  async search(query: AnalysisSearchQuery) {
    const db = getDatabase();
    const { q = "", channelId, limit = 20 } = query;
    const guildId = config.MONITOR_GUILD_ID;

    logger.debug({ q, channelId, limit, guildId }, "Searching analysis");

    const searchPattern = `%${q}%`;
    const limitVal = limit;

    let sqlQuery;
    if (channelId && guildId) {
      sqlQuery = sql`
        SELECT id, guild_id, channel_id, user_id, username, avatar_url,
               content, type, created_at, ai_status, ai_severity, ai_confidence
        FROM messages
        WHERE guild_id = ${guildId}
          AND channel_id = ${channelId}
          AND content ILIKE ${searchPattern}
        ORDER BY created_at DESC
        LIMIT ${limitVal}
      `;
    } else if (channelId) {
      sqlQuery = sql`
        SELECT id, guild_id, channel_id, user_id, username, avatar_url,
               content, type, created_at, ai_status, ai_severity, ai_confidence
        FROM messages
        WHERE channel_id = ${channelId}
          AND content ILIKE ${searchPattern}
        ORDER BY created_at DESC
        LIMIT ${limitVal}
      `;
    } else if (guildId) {
      sqlQuery = sql`
        SELECT id, guild_id, channel_id, user_id, username, avatar_url,
               content, type, created_at, ai_status, ai_severity, ai_confidence
        FROM messages
        WHERE guild_id = ${guildId}
          AND content ILIKE ${searchPattern}
        ORDER BY created_at DESC
        LIMIT ${limitVal}
      `;
    } else {
      sqlQuery = sql`
        SELECT id, guild_id, channel_id, user_id, username, avatar_url,
               content, type, created_at, ai_status, ai_severity, ai_confidence
        FROM messages
        WHERE content ILIKE ${searchPattern}
        ORDER BY created_at DESC
        LIMIT ${limitVal}
      `;
    }

    const { rows } = await db.execute(sqlQuery);
    return { results: rows };
  }
}

export const analysisService = new AnalysisService();
