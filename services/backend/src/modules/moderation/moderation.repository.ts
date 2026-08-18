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
        m.username,
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
}

export const moderationRepository = new ModerationRepository();
