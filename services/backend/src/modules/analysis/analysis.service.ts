import { sql } from "drizzle-orm";
import { config } from "../../shared/config/index.js";
import { getDatabase } from "../../shared/database/index.js";
import { createChildLogger } from "@bete/shared/logger";

const logger = createChildLogger("analysis.service");

export interface AnalysisSearchQuery {
  q?: string;
  channelId?: string;
  limit?: number;
}

/** Full message columns for search results — matches MessageRecord from client.ts */
const FULL_COLUMNS = sql.raw(`
  id, guild_id, channel_id, thread_id,
  user_id, username, avatar_url,
  content, edited_content, created_at, edited_at, deleted_at,
  type, metadata,
  ai_status, ai_moderation_flags, ai_moderation_score,
  ai_analysis, ai_categories, ai_severity, ai_confidence,
  ai_recommended_action, ai_analyzed_at, ai_error
`);

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
        SELECT ${FULL_COLUMNS}
        FROM messages
        WHERE guild_id = ${guildId}
          AND channel_id = ${channelId}
          AND content ILIKE ${searchPattern}
        ORDER BY created_at DESC
        LIMIT ${limitVal}
      `;
    } else if (channelId) {
      sqlQuery = sql`
        SELECT ${FULL_COLUMNS}
        FROM messages
        WHERE channel_id = ${channelId}
          AND content ILIKE ${searchPattern}
        ORDER BY created_at DESC
        LIMIT ${limitVal}
      `;
    } else if (guildId) {
      sqlQuery = sql`
        SELECT ${FULL_COLUMNS}
        FROM messages
        WHERE guild_id = ${guildId}
          AND content ILIKE ${searchPattern}
        ORDER BY created_at DESC
        LIMIT ${limitVal}
      `;
    } else {
      sqlQuery = sql`
        SELECT ${FULL_COLUMNS}
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
