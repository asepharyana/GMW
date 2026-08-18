import { sql } from "drizzle-orm";
import { getDatabase } from "../../shared/database/index.js";

export interface ChannelCultureRow {
  channel_id: string;
  guild_id: string | null;
  channel_name: string | null;
  culture_summary: string | null;
  last_analyzed_at: number | null;
}

export interface GlossaryRow {
  term: string;
  definition: string;
  source_url: string;
  resolved_at: number;
  hit_count: number;
}

export interface EditHistoryRow {
  id: string;
  message_id: string;
  old_content: string;
  edited_at: number;
  channel_id: string | null;
  channel_name: string | null;
  username: string | null;
}

export class KnowledgeRepository {
  /** Public read-only channel culture glossary (AI-generated norms/slang). */
  async listChannelCultures(limit = 50, search?: string) {
    const db = getDatabase();
    const conditions: string[] = [];
    if (search) {
      conditions.push(
        `(c.channel_id ILIKE '%${search.replace(/'/g, "''")}%' OR c.culture_summary ILIKE '%${search.replace(/'/g, "''")}%')`,
      );
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await db.execute(
      sql.raw(`
        SELECT
          c.channel_id,
          c.guild_id,
          COALESCE(NULLIF((
            SELECT (metadata::jsonb -> 'channel' ->> 'channelName')
            FROM messages WHERE channel_id = c.channel_id AND metadata IS NOT NULL
            LIMIT 1
          ), ''), c.channel_id) AS channel_name,
          c.culture_summary,
          c.last_analyzed_at
        FROM channel_cultures c
        ${where}
        ORDER BY c.last_analyzed_at DESC NULLS LAST
        LIMIT ${limit}
      `),
    );
    const rows = (result.rows as Record<string, unknown>[]) || [];
    return rows.map((r) => ({
      channel_id: String(r.channel_id),
      guild_id: r.guild_id ? String(r.guild_id) : null,
      channel_name: r.channel_name ? String(r.channel_name) : null,
      culture_summary: r.culture_summary ? String(r.culture_summary) : null,
      last_analyzed_at: r.last_analyzed_at ? Number(r.last_analyzed_at) : null,
    }));
  }

  /** Public read-only term knowledge base (resolved via Wikipedia/SearXNG). */
  async listGlossary(limit = 50, search?: string) {
    const db = getDatabase();
    const conditions: string[] = [];
    if (search) {
      conditions.push(
        `(term ILIKE '%${search.replace(/'/g, "''")}%' OR definition ILIKE '%${search.replace(/'/g, "''")}%')`,
      );
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await db.execute(
      sql.raw(`
        SELECT term, definition, source_url, resolved_at, hit_count
        FROM term_glossary_cache
        ${where}
        ORDER BY hit_count DESC, resolved_at DESC
        LIMIT ${limit}
      `),
    );
    const rows = (result.rows as Record<string, unknown>[]) || [];
    return rows.map((r) => ({
      term: String(r.term),
      definition: String(r.definition ?? ""),
      source_url: r.source_url ? String(r.source_url) : "",
      resolved_at: r.resolved_at ? Number(r.resolved_at) : 0,
      hit_count: Number(r.hit_count ?? 0),
    }));
  }
}

export const knowledgeRepository = new KnowledgeRepository();
