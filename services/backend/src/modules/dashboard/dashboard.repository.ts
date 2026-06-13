import { createChildLogger } from "@bete/shared/logger";
import { getPool } from "../../shared/database/index.js";
import type { ListUsersQuery } from "./dashboard.service.js";

const logger = createChildLogger("dashboard.repository");

export class DashboardRepository {
  async getStats() {
    const pool = getPool();

    // Total messages and breakdown by ai_status
    const msgResult = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total_messages,
        COUNT(*) FILTER (WHERE ai_status = 'flagged')::int AS total_flagged,
        COUNT(*) FILTER (WHERE ai_status = 'clean')::int AS total_clean,
        COUNT(*) FILTER (WHERE ai_status = 'warn')::int AS total_warned,
        COUNT(*) FILTER (WHERE ai_status = 'error')::int AS total_error,
        COUNT(*) FILTER (WHERE ai_status = 'pending')::int AS total_pending,
        COUNT(*) FILTER (WHERE ai_status = 'processing')::int AS total_processing,
        COUNT(DISTINCT user_id)::int AS total_users,
        COUNT(*) FILTER (WHERE created_at >= $1)::int AS today_messages,
        COUNT(*) FILTER (WHERE ai_status = 'flagged' AND created_at >= $1)::int AS today_flagged,
        COUNT(DISTINCT user_id) FILTER (WHERE created_at >= $2)::int AS active_users_24h
      FROM messages
    `,
      [Date.now() - 86400000, Date.now() - 86400000],
    );

    const msgRow = msgResult.rows[0];

    // Total voice recordings
    const voiceResult = await pool.query(`
      SELECT COUNT(*)::int AS count FROM voice_recordings
    `);

    // Total AI user profiles
    const profileResult = await pool.query(`
      SELECT COUNT(*)::int AS count FROM user_profiles
    `);

    // Top channels by message count
    const topChannels = await pool.query(`
      SELECT channel_id, COUNT(*)::int AS message_count
      FROM messages
      GROUP BY channel_id
      ORDER BY COUNT(*) DESC
      LIMIT 10
    `);

    return {
      total_messages: msgRow?.total_messages ?? 0,
      total_users: msgRow?.total_users ?? 0,
      total_flagged: msgRow?.total_flagged ?? 0,
      total_clean: msgRow?.total_clean ?? 0,
      total_warned: msgRow?.total_warned ?? 0,
      total_error: msgRow?.total_error ?? 0,
      total_voice_recordings: voiceResult.rows[0]?.count ?? 0,
      total_profiles: profileResult.rows[0]?.count ?? 0,
      today_messages: msgRow?.today_messages ?? 0,
      today_flagged: msgRow?.today_flagged ?? 0,
      active_users_24h: msgRow?.active_users_24h ?? 0,
      top_channels: topChannels.rows.map((r: Record<string, unknown>) => ({
        channel_id: String(r.channel_id),
        message_count: Number(r.message_count),
      })),
      moderation_overview: {
        pending: msgRow?.total_pending ?? 0,
        processing: msgRow?.total_processing ?? 0,
        error: msgRow?.total_error ?? 0,
      },
    };
  }

  async listUsers(query: ListUsersQuery) {
    const pool = getPool();
    const limit = query.limit ?? 20;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (query.search) {
      conditions.push(
        `(m.user_id ILIKE $${paramIdx} OR m.username ILIKE $${paramIdx})`,
      );
      params.push(`%${query.search}%`);
      paramIdx++;
    }

    if (query.cursor) {
      conditions.push(`m.last_message_at < $${paramIdx}`);
      params.push(Number(query.cursor));
      paramIdx++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `
      SELECT
        m.user_id,
        m.username,
        m.avatar_url,
        p.profile_summary,
        m.total_messages,
        m.flagged_count,
        m.last_message_at,
        r.trust_score
      FROM (
        SELECT
          user_id,
          username,
          avatar_url,
          COUNT(*)::int AS total_messages,
          COUNT(*) FILTER (WHERE ai_status = 'flagged')::int AS flagged_count,
          MAX(created_at) AS last_message_at
        FROM messages
        GROUP BY user_id, username, avatar_url
      ) m
      LEFT JOIN user_profiles p ON p.user_id = m.user_id
      LEFT JOIN user_reputations r ON r.user_id = m.user_id
      ${whereClause}
      ORDER BY m.last_message_at DESC NULLS LAST
      LIMIT $${paramIdx}
      `,
      [...params, limit + 1],
    );

    const data = (rows as Record<string, unknown>[])
      .slice(0, limit)
      .map((r) => ({
        user_id: String(r.user_id),
        username: r.username as string | null,
        avatar_url: r.avatar_url as string | null,
        profile_summary: r.profile_summary as string | null,
        total_messages: Number(r.total_messages),
        flagged_count: Number(r.flagged_count),
        last_message_at: r.last_message_at ? Number(r.last_message_at) : null,
        trust_score:
          r.trust_score !== null && r.trust_score !== undefined
            ? Number(r.trust_score)
            : null,
      }));

    const lastRow = rows[limit - 1] as Record<string, unknown> | undefined;
    const nextCursor =
      rows.length > limit
        ? String(lastRow?.last_message_at ?? lastRow?.total_messages ?? "")
        : null;

    return { data, nextCursor };
  }

  async getUserDetail(userId: string) {
    const pool = getPool();

    // Basic user info + profile + reputation
    const userResult = await pool.query(
      `
      SELECT
        m.user_id,
        m.username,
        m.avatar_url,
        m.total_messages,
        m.flagged_count,
        m.clean_count,
        p.profile_summary,
        p.last_analyzed_at,
        r.trust_score,
        r.clean_message_streak,
        r.total_infractions
      FROM (
        SELECT
          user_id,
          username,
          avatar_url,
          COUNT(*)::int AS total_messages,
          COUNT(*) FILTER (WHERE ai_status = 'flagged')::int AS flagged_count,
          COUNT(*) FILTER (WHERE ai_status = 'clean')::int AS clean_count
        FROM messages
        WHERE user_id = $1
        GROUP BY user_id, username, avatar_url
      ) m
      LEFT JOIN user_profiles p ON p.user_id = m.user_id
      LEFT JOIN user_reputations r ON r.user_id = m.user_id
      `,
      [userId],
    );

    const row = userResult.rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }

    // Recent messages
    const recent = await pool.query(
      `
      SELECT id, content, channel_id, created_at, ai_status
      FROM messages
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 20
      `,
      [userId],
    );

    return {
      user_id: String(row.user_id),
      username: row.username as string | null,
      avatar_url: row.avatar_url as string | null,
      total_messages: Number(row.total_messages),
      flagged_count: Number(row.flagged_count),
      clean_count: Number(row.clean_count),
      profile_summary: row.profile_summary as string | null,
      last_analyzed_at: row.last_analyzed_at
        ? Number(row.last_analyzed_at)
        : null,
      trust_score: row.trust_score !== null ? Number(row.trust_score) : null,
      clean_message_streak:
        row.clean_message_streak !== null
          ? Number(row.clean_message_streak)
          : null,
      total_infractions:
        row.total_infractions !== null ? Number(row.total_infractions) : null,
      recent_messages: (recent.rows as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        content: String(r.content),
        channel_id: String(r.channel_id),
        created_at: Number(r.created_at),
        ai_status: r.ai_status as string | null,
      })),
    };
  }
}

export const dashboardRepository = new DashboardRepository();
