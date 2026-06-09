import { createChildLogger } from "@bete/shared/logger";
import { getPool } from "../../shared/database/index.js";
import {
  type MappedMessage,
  mapMessageRow,
} from "../../shared/utils/messageMapper.js";

const logger = createChildLogger("analysis.repository");

export interface AnalysisSearchQuery {
  q?: string;
  channelId?: string;
  guildId?: string;
  limit?: number;
}

// AnalysisSearchResult is identical to MappedMessage — reuse the shared mapper
export type AnalysisSearchResult = MappedMessage;

export class AnalysisRepository {
  async search(query: AnalysisSearchQuery): Promise<AnalysisSearchResult[]> {
    const pool = getPool();
    const { q = "", channelId, guildId, limit = 20 } = query;

    logger.debug({ q, channelId, guildId, limit }, "Searching analysis");

    const searchPattern = `%${q}%`;
    const clauses: string[] = ["content ILIKE $1"];
    const params: (string | number)[] = [searchPattern];
    let p = 2;

    if (guildId) {
      clauses.push(`guild_id = $${p}`);
      params.push(guildId);
      p++;
    }

    if (channelId) {
      clauses.push(`channel_id = $${p}`);
      params.push(channelId);
      p++;
    }

    const where = clauses.join(" AND ");
    const { rows } = await pool.query(
      `SELECT
        id, guild_id, channel_id, thread_id,
        user_id, username, avatar_url,
        content, edited_content, created_at, edited_at, deleted_at,
        type, metadata,
        ai_status, ai_moderation_flags, ai_moderation_score,
        ai_analysis, ai_categories, ai_severity, ai_confidence,
        ai_recommended_action, ai_analyzed_at, ai_error
      FROM messages
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT $${p}`,
      [...params, limit],
    );

    return rows.map((r) => mapMessageRow(r as Record<string, unknown>));
  }
}

export const analysisRepository = new AnalysisRepository();
