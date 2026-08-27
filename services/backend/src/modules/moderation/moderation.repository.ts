import { sql } from "drizzle-orm";
import { getDatabase } from "../../shared/database/index.js";

export interface ListModerationQuery {
  status?: string;
  actionType?: string;
  limit?: number;
  cursor?: number;
}

const ACTION_TYPES = [
  "delete_message",
  "mute_user",
  "warn_user",
  "kick_user",
  "ban_user",
] as const;
const STATUSES = ["pending", "executed", "failed"] as const;

/** Parse a JSON-stringified array column (e.g. flags/categories/evidence).
 *  Returns null on empty/malformed input so the FE can treat it as "no data". */
function parseJsonArray(value: unknown): string[] | null {
  if (value == null) return null;
  const str = typeof value === "string" ? value : String(value);
  if (str.length === 0) return null;
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? (parsed as string[]) : null;
  } catch {
    return null;
  }
}

export class ModerationRepository {
  async getStats() {
    const db = getDatabase();
    const result = await db.execute(sql`
      SELECT action_type, status, COUNT(*)::int AS c
      FROM moderation_actions
      GROUP BY action_type, status
    `);

    const rows = (result.rows as Record<string, unknown>[]) || [];
    let executed = 0;
    let failed = 0;
    let pending = 0;

    const byAction: Record<
      string,
      { executed: number; failed: number; pending: number }
    > = {};

    for (const r of rows) {
      const actionType = String(r.action_type ?? "unknown");
      const status = String(r.status ?? "unknown");
      const count = Number(r.c ?? 0);
      byAction[actionType] ??= { executed: 0, failed: 0, pending: 0 };
      if (status === "executed") {
        executed += count;
        byAction[actionType].executed += count;
      } else if (status === "failed") {
        failed += count;
        byAction[actionType].failed += count;
      } else {
        pending += count;
        byAction[actionType].pending += count;
      }
    }

    const total = executed + failed + pending;

    return {
      total,
      executed,
      failed,
      pending,
      failed_rate: total > 0 ? Number(((failed / total) * 100).toFixed(1)) : 0,
      by_action: byAction,
    };
  }

  async listActions(query: ListModerationQuery) {
    const db = getDatabase();
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const conditions: string[] = [];

    if (
      query.status &&
      (STATUSES as readonly string[]).includes(query.status)
    ) {
      conditions.push(`a.status = '${query.status}'`);
    }
    if (
      query.actionType &&
      (ACTION_TYPES as readonly string[]).includes(query.actionType)
    ) {
      conditions.push(`a.action_type = '${query.actionType}'`);
    }
    if (query.cursor) {
      conditions.push(`a.created_at < ${Number(query.cursor)}`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await db.execute(
      sql.raw(`
      SELECT
        a.id,
        a.message_id,
        a.user_id,
        a.guild_id,
        a.action_type,
        a.reason,
        a.executed_by,
        a.status,
        a.error,
        a.created_at,
        a.executed_at,
        a.flags,
        a.categories,
        a.severity,
        a.confidence,
        a.score,
        a.evidence,
        a.policy_version,
        a.username,
        LEFT(m.content, 300) AS content
      FROM moderation_actions a
      LEFT JOIN messages m ON m.id = a.message_id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT ${limit + 1}
    `),
    );

    const rows = (result.rows as Record<string, unknown>[]) || [];
    const data = rows.slice(0, limit).map((r) => ({
      id: String(r.id ?? ""),
      message_id: r.message_id ? String(r.message_id) : null,
      user_id: r.user_id ? String(r.user_id) : null,
      guild_id: String(r.guild_id ?? ""),
      action_type: String(r.action_type ?? "unknown"),
      reason: r.reason ? String(r.reason) : null,
      executed_by: r.executed_by ? String(r.executed_by) : null,
      status: String(r.status ?? "unknown"),
      error: r.error ? String(r.error) : null,
      created_at: r.created_at ? Number(r.created_at) : null,
      executed_at: r.executed_at ? Number(r.executed_at) : null,
      flags: parseJsonArray(r.flags),
      categories: parseJsonArray(r.categories),
      severity: r.severity ? String(r.severity) : null,
      confidence: r.confidence != null ? Number(r.confidence) : null,
      score: r.score != null ? Number(r.score) : null,
      evidence: parseJsonArray(r.evidence),
      policy_version: r.policy_version ? String(r.policy_version) : null,
      username: r.username ? String(r.username) : null,
      content: r.content ? String(r.content) : null,
    }));

    const lastRow = rows[limit - 1] as Record<string, unknown> | undefined;
    const nextCursor =
      rows.length > limit ? String(lastRow?.created_at ?? "") : null;

    return { data, nextCursor };
  }

  /**
   * Aggregate moderation trends over the last `days` days.
   * - category counts (from the jsonb/text[] `categories` column, unnested)
   * - severity distribution
   * - action_type distribution
   * Read-only; powers the public Toxic Topic Trends panel.
   */
  async getTrends(days: number) {
    const db = getDatabase();
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    const cats = await db.execute(sql`
      SELECT jsonb_array_elements_text(a.categories::jsonb) AS cat, COUNT(*)::int AS c
      FROM moderation_actions a
      WHERE a.created_at >= ${since} AND a.categories IS NOT NULL AND a.categories != '[]' AND a.categories != ''
      GROUP BY cat
      ORDER BY c DESC
      LIMIT 15
    `);
    const catRows = (cats.rows as Record<string, unknown>[]) || [];

    const sev = await db.execute(sql`
      SELECT severity, COUNT(*)::int AS c
      FROM moderation_actions
      WHERE created_at >= ${since} AND severity IS NOT NULL
      GROUP BY severity
    `);
    const sevRows = (sev.rows as Record<string, unknown>[]) || [];

    const act = await db.execute(sql`
      SELECT action_type, COUNT(*)::int AS c
      FROM moderation_actions
      WHERE created_at >= ${since}
      GROUP BY action_type
      ORDER BY c DESC
    `);
    const actRows = (act.rows as Record<string, unknown>[]) || [];

    return {
      categories: catRows.map((r) => ({
        name: String(r.cat),
        count: Number(r.c ?? 0),
      })),
      severities: sevRows.map((r) => ({
        level: String(r.severity),
        count: Number(r.c ?? 0),
      })),
      actions: actRows.map((r) => ({
        type: String(r.action_type),
        count: Number(r.c ?? 0),
      })),
    };
  }

  /**
   * Top flagged domains over the last `days` days.
   * Extracts the host from any URL in `content`/`reason`/`evidence` and ranks
   * by how often it appears in moderation actions. Powers the Scam Domain panel.
   */
  async getTopFlaggedDomains(days: number) {
    const db = getDatabase();
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const result = await db.execute(sql`
      SELECT host, COUNT(*)::int AS c
      FROM (
        SELECT DISTINCT a.id,
          (regexp_matches(COALESCE(a.content,'') || ' ' || COALESCE(a.reason,'') || ' ' || COALESCE(a.evidence,''), 'https?://([^/\s?#]+)', 'g'))[1] AS host
        FROM moderation_actions a
        WHERE a.created_at >= ${since}
          AND (a.content IS NOT NULL OR a.reason IS NOT NULL OR a.evidence IS NOT NULL)
      ) sub
      WHERE host IS NOT NULL
      GROUP BY host
      ORDER BY c DESC
      LIMIT 20
    `);
    const rows = (result.rows as Record<string, unknown>[]) || [];
    return rows.map((r) => ({
      domain: String(r.host).toLowerCase(),
      count: Number(r.c ?? 0),
    }));
  }

  /**
   * Top flagged channels over the last `days` days.
   * Joins moderation_actions → messages to attribute each action to a channel.
   * Powers the Top Flagged Channels panel.
   */
  async getTopFlaggedChannels(days: number) {
    const db = getDatabase();
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const result = await db.execute(sql`
      SELECT
        m.channel_id,
        COALESCE(NULLIF((m.metadata::jsonb -> 'channel' ->> 'channelName'), ''), m.channel_id) AS channel_name,
        COUNT(*)::int AS flagged_count
      FROM moderation_actions a
      LEFT JOIN messages m ON m.id = a.message_id
      WHERE a.created_at >= ${since} AND m.channel_id IS NOT NULL
      GROUP BY m.channel_id, (m.metadata::jsonb -> 'channel' ->> 'channelName')
      ORDER BY flagged_count DESC
      LIMIT 15
    `);
    const rows = (result.rows as Record<string, unknown>[]) || [];
    return rows.map((r) => ({
      channel_id: String(r.channel_id),
      channel_name: r.channel_name ? String(r.channel_name) : null,
      flagged_count: Number(r.flagged_count),
    }));
  }

  /**
   * Hour-of-day distribution of moderation actions over the last `days` days.
   * 24 rows (hour 0..23), with total + flagged-by-severity counts.
   * Powers the Moderation Heatmap by Hour panel.
   */
  async getHourlyModeration(days: number) {
    const db = getDatabase();
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const result = await db.execute(sql`
      SELECT
        EXTRACT(HOUR FROM to_timestamp(created_at / 1000))::int AS hour,
        COUNT(*)::int AS total
      FROM moderation_actions
      WHERE created_at >= ${since}
      GROUP BY hour
      ORDER BY hour
    `);
    const rows = (result.rows as Record<string, unknown>[]) || [];
    const byHour = new Map<number, number>();
    for (const r of rows) byHour.set(Number(r.hour), Number(r.total));
    return Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      total: byHour.get(h) ?? 0,
    }));
  }

  /**
   * Moderation actions filtered to a single category (drill-down).
   * Powers the Flag Category Drill-down panel.
   */
  async getByCategory(days: number, category: string, limit = 50) {
    const db = getDatabase();
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const result = await db.execute(
      sql.raw(`
      SELECT
        a.id, a.message_id, a.user_id, a.guild_id, a.action_type,
        a.reason, a.status, a.created_at, a.severity, a.confidence, a.score,
        a.username, LEFT(m.content, 300) AS content
      FROM moderation_actions a
      LEFT JOIN messages m ON m.id = a.message_id
      WHERE a.created_at >= ${since}
        AND a.categories IS NOT NULL
        AND a.categories::jsonb @> ${JSON.stringify([category])}::jsonb
      ORDER BY a.created_at DESC
      LIMIT ${limit}
    `),
    );
    const rows = (result.rows as Record<string, unknown>[]) || [];
    return rows.map((r) => ({
      id: String(r.id ?? ""),
      message_id: r.message_id ? String(r.message_id) : null,
      user_id: r.user_id ? String(r.user_id) : null,
      guild_id: String(r.guild_id ?? ""),
      action_type: String(r.action_type ?? "unknown"),
      reason: r.reason ? String(r.reason) : null,
      status: String(r.status ?? "unknown"),
      created_at: r.created_at ? Number(r.created_at) : null,
      severity: r.severity ? String(r.severity) : null,
      confidence: r.confidence != null ? Number(r.confidence) : null,
      score: r.score != null ? Number(r.score) : null,
      username: r.username ? String(r.username) : null,
      content: r.content ? String(r.content) : null,
    }));
  }

  /**
   * Auto-moderation coverage over the last `days` days.
   * Run completion rate from ai_analysis_runs — what fraction of analysis runs
   * completed (vs failed/pending). Public "how much is automated" trust metric.
   */
  async getCoverage(days: number) {
    const db = getDatabase();
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const result = await db.execute(sql`
      SELECT status, COUNT(*)::int AS c
      FROM ai_analysis_runs
      WHERE created_at >= ${since}
      GROUP BY status
    `);
    const rows = (result.rows as Record<string, unknown>[]) || [];
    const counts: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      const s = String(r.status);
      const c = Number(r.c ?? 0);
      counts[s] = c;
      total += c;
    }
    const completed = counts.completed ?? 0;
    const failed = counts.failed ?? 0;
    const pending = (counts.pending ?? 0) + (counts.processing ?? 0);
    return {
      total,
      completed,
      failed,
      pending,
      coverage_rate:
        total > 0 ? Number(((completed / total) * 100).toFixed(1)) : 0,
      failed_rate: total > 0 ? Number(((failed / total) * 100).toFixed(1)) : 0,
    };
  }
}

export const moderationRepository = new ModerationRepository();
