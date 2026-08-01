import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getDatabase } from "../../shared/database/index.js";
import {
  pgChannelCulturesTable,
  pgMessagesTable,
  pgUserProfilesTable,
  pgUserReputationsTable,
  pgVoiceRecordingsTable,
} from "../../shared/index.js";
import type { ListUsersQuery } from "./dashboard.service.js";

export class DashboardRepository {
  async getStats() {
    const db = getDatabase();

    const oneDayAgo = Date.now() - 86400000;

    // Total messages and breakdown by ai_status
    const msgResult = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total_messages,
        COUNT(*) FILTER (WHERE ai_status = 'flagged')::int AS total_flagged,
        COUNT(*) FILTER (WHERE ai_status = 'clean')::int AS total_clean,
        COUNT(*) FILTER (WHERE ai_status = 'warn')::int AS total_warned,
        COUNT(*) FILTER (WHERE ai_status = 'error')::int AS total_error,
        COUNT(*) FILTER (WHERE ai_status = 'pending')::int AS total_pending,
        COUNT(*) FILTER (WHERE ai_status = 'processing')::int AS total_processing,
        COUNT(DISTINCT user_id)::int AS total_users,
        COUNT(*) FILTER (WHERE created_at >= ${oneDayAgo})::int AS today_messages,
        COUNT(*) FILTER (WHERE ai_status = 'flagged' AND created_at >= ${oneDayAgo})::int AS today_flagged,
        COUNT(DISTINCT user_id) FILTER (WHERE created_at >= ${oneDayAgo})::int AS active_users_24h
      FROM ${pgMessagesTable}
    `);

    const msgRow = msgResult.rows[0] as Record<string, unknown> | undefined;

    // Total voice recordings
    const voiceResult = await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM ${pgVoiceRecordingsTable}
    `);

    // Total AI user profiles
    const profileResult = await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM ${pgUserProfilesTable}
    `);

    // Top channels by message count
    const topChannels = await db.execute(sql`
      SELECT channel_id,
             COALESCE(NULLIF((metadata::jsonb -> 'channel' ->> 'channelName'), ''), channel_id) AS channel_name,
             COUNT(*)::int AS message_count
      FROM ${pgMessagesTable}
      WHERE metadata IS NOT NULL AND metadata != ''
      GROUP BY channel_id, (metadata::jsonb -> 'channel' ->> 'channelName')
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
        channel_name: r.channel_name ? String(r.channel_name) : null,
        message_count: Number(r.message_count),
      })),
      moderation_overview: {
        pending: msgRow?.total_pending ?? 0,
        processing: msgRow?.total_processing ?? 0,
        error: msgRow?.total_error ?? 0,
      },
    };
  }

  async getActivity(days: number) {
    const db = getDatabase();
    const sinceMs = Date.now() - days * 86400000;
    const dayAgoMs = Date.now() - 86400000;

    // Daily buckets (last N days)
    const daily = await db.execute(sql`
      SELECT
        to_char(to_timestamp(created_at / 1000), 'YYYY-MM-DD') AS day,
        COUNT(*)::int AS messages,
        COUNT(*) FILTER (WHERE ai_status = 'flagged')::int AS flagged,
        COUNT(DISTINCT user_id)::int AS active_users
      FROM ${pgMessagesTable}
      WHERE created_at >= ${sinceMs}
      GROUP BY day
      ORDER BY day
    `);

    // Hourly distribution (last 24h)
    const hourly = await db.execute(sql`
      SELECT
        EXTRACT(HOUR FROM to_timestamp(created_at / 1000))::int AS hour,
        COUNT(*)::int AS messages,
        COUNT(*) FILTER (WHERE ai_status = 'flagged')::int AS flagged
      FROM ${pgMessagesTable}
      WHERE created_at >= ${dayAgoMs}
      GROUP BY hour
      ORDER BY hour
    `);

    return {
      days,
      daily: (daily.rows as Record<string, unknown>[]).map((r) => ({
        day: String(r.day),
        messages: Number(r.messages),
        flagged: Number(r.flagged),
        active_users: Number(r.active_users),
      })),
      hourly: (hourly.rows as Record<string, unknown>[]).map((r) => ({
        hour: Number(r.hour),
        messages: Number(r.messages),
        flagged: Number(r.flagged),
      })),
    };
  }

  async listUsers(query: ListUsersQuery) {
    const db = getDatabase();
    const limit = query.limit ?? 20;
    const conditions: SQL[] = [];

    if (query.search) {
      conditions.push(
        sql`(m.user_id ILIKE ${`%${query.search}%`} OR m.username ILIKE ${`%${query.search}%`})`,
      );
    }

    if (query.cursor) {
      conditions.push(sql`m.last_message_at < ${Number(query.cursor)}`);
    }

    const whereClause =
      conditions.length > 0
        ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
        : sql``;

    const { rows } = await db.execute(sql`
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
        FROM ${pgMessagesTable}
        GROUP BY user_id, username, avatar_url
      ) m
      LEFT JOIN ${pgUserProfilesTable} p ON p.user_id = m.user_id
      LEFT JOIN ${pgUserReputationsTable} r ON r.user_id = m.user_id
      ${whereClause}
      ORDER BY m.last_message_at DESC NULLS LAST
      LIMIT ${limit + 1}
    `);

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

  async listChannels(query: ListUsersQuery & { guildId?: string }) {
    const db = getDatabase();
    const limit = query.limit ?? 20;
    const conditions: SQL[] = [];

    if (query.search) {
      conditions.push(
        sql`(m.channel_id ILIKE ${`%${query.search}%`} OR m.channel_name ILIKE ${`%${query.search}%`})`,
      );
    }

    if (query.guildId) {
      conditions.push(sql`m.guild_id = ${query.guildId}`);
    }

    const whereClause =
      conditions.length > 0
        ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
        : sql``;

    const { rows } = await db.execute(sql`
      SELECT
        m.channel_id,
        m.channel_name,
        m.guild_id,
        m.total_messages,
        m.flagged_count,
        m.last_message_at,
        c.culture_summary,
        c.last_analyzed_at
      FROM (
        SELECT
          channel_id,
          guild_id,
          COALESCE(NULLIF((metadata::jsonb -> 'channel' ->> 'channelName'), ''), channel_id) AS channel_name,
          COUNT(*)::int AS total_messages,
          COUNT(*) FILTER (WHERE ai_status = 'flagged')::int AS flagged_count,
          MAX(created_at) AS last_message_at
        FROM ${pgMessagesTable}
        GROUP BY channel_id, guild_id, (metadata::jsonb -> 'channel' ->> 'channelName')
      ) m
      LEFT JOIN ${pgChannelCulturesTable} c ON c.channel_id = m.channel_id
      ${whereClause}
      ORDER BY m.total_messages DESC
      LIMIT ${limit + 1}
    `);

    const data = ((rows as Record<string, unknown>[]) || [])
      .slice(0, limit)
      .map((r) => ({
        channel_id: String(r.channel_id),
        channel_name: r.channel_name as string | null,
        guild_id: r.guild_id as string | null,
        total_messages: Number(r.total_messages),
        flagged_count: Number(r.flagged_count),
        last_message_at: r.last_message_at ? Number(r.last_message_at) : null,
        culture_summary: r.culture_summary as string | null,
        last_analyzed_at: r.last_analyzed_at
          ? Number(r.last_analyzed_at)
          : null,
      }));

    const lastRow = rows[limit - 1] as Record<string, unknown> | undefined;
    const nextCursor =
      rows.length > limit ? String(lastRow?.total_messages ?? "") : null;

    return { data, nextCursor };
  }

  async getChannelDetail(channelId: string) {
    const db = getDatabase();

    const channelResult = await db.execute(sql`
      SELECT
        m.channel_id,
        m.channel_name,
        m.guild_id,
        m.total_messages,
        m.flagged_count,
        m.clean_count,
        c.culture_summary,
        c.last_analyzed_at
      FROM (
        SELECT
          channel_id,
          guild_id,
          COALESCE(NULLIF((metadata::jsonb -> 'channel' ->> 'channelName'), ''), channel_id) AS channel_name,
          COUNT(*)::int AS total_messages,
          COUNT(*) FILTER (WHERE ai_status = 'flagged')::int AS flagged_count,
          COUNT(*) FILTER (WHERE ai_status = 'clean')::int AS clean_count
        FROM ${pgMessagesTable}
        WHERE channel_id = ${channelId}
        GROUP BY channel_id, guild_id, (metadata::jsonb -> 'channel' ->> 'channelName')
      ) m
      LEFT JOIN ${pgChannelCulturesTable} c ON c.channel_id = m.channel_id
    `);

    const row = channelResult.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;

    const recent = await db.execute(sql`
      SELECT id, content, channel_id, created_at, ai_status, username
      FROM ${pgMessagesTable}
      WHERE channel_id = ${channelId}
      ORDER BY created_at DESC
      LIMIT 20
    `);

    return {
      channel_id: String(row.channel_id),
      channel_name: row.channel_name as string | null,
      guild_id: row.guild_id as string | null,
      total_messages: Number(row.total_messages),
      flagged_count: Number(row.flagged_count),
      clean_count: Number(row.clean_count),
      culture_summary: row.culture_summary as string | null,
      last_analyzed_at: row.last_analyzed_at
        ? Number(row.last_analyzed_at)
        : null,
      recent_messages: (recent.rows as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        content: String(r.content),
        channel_id: String(r.channel_id),
        created_at: Number(r.created_at),
        ai_status: r.ai_status as string | null,
        username: r.username as string | null,
      })),
    };
  }

  async getUserDetail(userId: string) {
    const db = getDatabase();

    const userResult = await db.execute(sql`
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
        FROM ${pgMessagesTable}
        WHERE user_id = ${userId}
        GROUP BY user_id, username, avatar_url
      ) m
      LEFT JOIN ${pgUserProfilesTable} p ON p.user_id = m.user_id
      LEFT JOIN ${pgUserReputationsTable} r ON r.user_id = m.user_id
    `);

    const row = userResult.rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }

    const recent = await db.execute(sql`
      SELECT id, content, channel_id, created_at, ai_status
      FROM ${pgMessagesTable}
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 20
    `);

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
      trust_score: row.trust_score != null ? Number(row.trust_score) : null,
      clean_message_streak:
        row.clean_message_streak != null
          ? Number(row.clean_message_streak)
          : null,
      total_infractions:
        row.total_infractions != null ? Number(row.total_infractions) : null,
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
