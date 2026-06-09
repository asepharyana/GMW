import { createChildLogger } from "@bete/shared/logger";
import { getPool } from "../../shared/database/index.js";

const logger = createChildLogger("analysis.repository");

export interface AnalysisSearchQuery {
  q?: string;
  channelId?: string;
  guildId?: string;
  limit?: number;
}

export interface AnalysisSearchResult {
  id: string;
  guild_id: string;
  channel_id: string;
  thread_id: string | null;
  user_id: string;
  username: string;
  avatar_url: string | null;
  content: string;
  edited_content: string | null;
  created_at: number;
  edited_at: number | null;
  deleted_at: number | null;
  type: string;
  metadata: string | null;
  ai_status: string | null;
  ai_moderation_flags: string | null;
  ai_moderation_score: number | null;
  ai_analysis: string | null;
  ai_categories: string | null;
  ai_severity: string | null;
  ai_confidence: number | null;
  ai_recommended_action: string | null;
  ai_analyzed_at: number | null;
  ai_error: string | null;
}

function mapSearchResult(row: Record<string, unknown>): AnalysisSearchResult {
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

    return rows.map((r) => mapSearchResult(r as Record<string, unknown>));
  }
}

export const analysisRepository = new AnalysisRepository();
