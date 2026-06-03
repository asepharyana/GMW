import { createChildLogger } from "@bete/shared/logger";
import { getPool } from "../../shared/database/index.js";

const logger = createChildLogger("analytics.repository");

interface TimeFilter {
  where: string;
  params: Array<string | number>;
  paramOffset: number;
}

function buildTimeFilter(
  guildId: string,
  channelId: string | undefined,
  hours: number,
  offset = 1,
): TimeFilter {
  const clauses: string[] = ["guild_id = $" + offset];
  const params: Array<string | number> = [guildId];
  let p = offset + 1;

  if (channelId) {
    clauses.push("channel_id = $" + p);
    params.push(channelId);
    p++;
  }

  clauses.push("created_at > (EXTRACT(EPOCH FROM NOW()) * 1000 - $" + p + ")");
  params.push(hours * 3_600_000);

  return { where: "WHERE " + clauses.join(" AND "), params, paramOffset: p };
}

export class AnalyticsRepository {
  async getOverview(guildId: string, channelId?: string, hours = 24) {
    logger.debug({ guildId, channelId, hours }, "Getting analytics overview");
    const pool = getPool();
    const now = Date.now();
    const start = now - hours * 3_600_000;
    const filter = buildTimeFilter(guildId, channelId, hours);

    const { rows } = await pool.query(
      `
        SELECT
          COUNT(*)::int                        AS total_messages,
          COUNT(DISTINCT user_id)::int         AS active_users_count,
          COUNT(DISTINCT channel_id)::int      AS total_channels,
          COUNT(*) FILTER (WHERE ai_status = 'clean')::int    AS clean,
          COUNT(*) FILTER (WHERE ai_status = 'warn')::int     AS warned,
          COUNT(*) FILTER (WHERE ai_status = 'flagged')::int  AS flagged,
          COUNT(*) FILTER (WHERE ai_status = 'error')::int    AS error,
          COUNT(*) FILTER (WHERE ai_status = 'pending')::int  AS pending,
          COALESCE(AVG(ai_moderation_score), 0)::real         AS average_score
        FROM messages
        ${filter.where}
      `,
      filter.params,
    );

    const row = rows[0] as Record<string, unknown> | undefined;

    // Fetch hourly stats, topics, and top violators to include in overview
    const hourly = await this.getHourlyStats(guildId, channelId, hours);
    const topics = await this.getTopics(guildId, channelId, hours);
    const topUsers = await this.getTopViolators(guildId, channelId, hours, 5);

    return {
      period: { start, end: now },
      messages: {
        total: Number(row?.total_messages ?? 0),
        clean: Number(row?.clean ?? 0),
        warned: Number(row?.warned ?? 0),
        flagged: Number(row?.flagged ?? 0),
        error: Number(row?.error ?? 0),
        pending: Number(row?.pending ?? 0),
        average_score: Number(row?.average_score ?? 0),
      },
      hourly,
      topics,
      top_users: topUsers,
      active_users_count: Number(row?.active_users_count ?? 0),
      total_channels: Number(row?.total_channels ?? 0),
    };
  }

  async getDailyTrend(guildId: string, hours = 24) {
    logger.debug({ guildId, hours }, "Getting daily trend");
    const pool = getPool();
    const filter = buildTimeFilter(guildId, undefined, hours);

    const { rows } = await pool.query(
      `
        SELECT
          TO_CHAR(to_timestamp(created_at / 1000), 'YYYY-MM-DD') AS date,
          COUNT(*)::int AS count,
          COUNT(*) FILTER (WHERE ai_status = 'clean')::int    AS clean,
          COUNT(*) FILTER (WHERE ai_status = 'warn')::int     AS warned,
          COUNT(*) FILTER (WHERE ai_status = 'flagged')::int  AS flagged,
          COUNT(*) FILTER (WHERE ai_status = 'error')::int    AS error
        FROM messages
        ${filter.where}
        GROUP BY date
        ORDER BY date ASC
      `,
      filter.params,
    );

    return rows.map((r) => ({
      date: r.date as string,
      count: Number(r.count ?? 0),
      clean: Number(r.clean ?? 0),
      warned: Number(r.warned ?? 0),
      flagged: Number(r.flagged ?? 0),
      error: Number(r.error ?? 0),
    }));
  }

  async getHourlyStats(guildId: string, channelId?: string, hours = 24) {
    logger.debug({ guildId, channelId, hours }, "Getting hourly stats");
    const pool = getPool();
    const filter = buildTimeFilter(guildId, channelId, hours);

    const { rows } = await pool.query(
      `
        SELECT
          TO_CHAR(to_timestamp(created_at / 1000), 'HH24') AS hour,
          COUNT(*)::int AS count,
          COUNT(*) FILTER (WHERE ai_status = 'clean')::int    AS clean,
          COUNT(*) FILTER (WHERE ai_status = 'warn')::int     AS warned,
          COUNT(*) FILTER (WHERE ai_status = 'flagged')::int  AS flagged,
          COUNT(*) FILTER (WHERE ai_status = 'error')::int    AS error
        FROM messages
        ${filter.where}
        GROUP BY hour
        ORDER BY hour ASC
      `,
      filter.params,
    );

    return rows.map((r) => ({
      hour: r.hour as string,
      count: Number(r.count ?? 0),
      clean: Number(r.clean ?? 0),
      warned: Number(r.warned ?? 0),
      flagged: Number(r.flagged ?? 0),
      error: Number(r.error ?? 0),
    }));
  }

  async getTopViolators(
    guildId: string,
    channelId?: string,
    hours = 24,
    limit = 10,
  ) {
    logger.debug({ guildId, channelId, hours, limit }, "Getting top violators");
    const pool = getPool();
    const filter = buildTimeFilter(guildId, channelId, hours);

    const { rows } = await pool.query(
      `
        SELECT
          user_id,
          MAX(username)    AS username,
          MAX(avatar_url)  AS avatar_url,
          COUNT(*)::int    AS total_messages,
          COUNT(*) FILTER (WHERE ai_status IN ('warn', 'flagged', 'error'))::int AS flagged_count,
          COUNT(*) FILTER (WHERE ai_status = 'warn')::int    AS warned_count,
          COUNT(*) FILTER (WHERE ai_status = 'flagged')::int AS hard_flagged_count,
          COUNT(*) FILTER (WHERE ai_status = 'error')::int   AS error_count,
          COALESCE(AVG(ai_moderation_score), 0)::real        AS violation_score,
          MAX(ai_moderation_flags)  AS worst_flags,
          MAX(created_at)           AS last_violation
        FROM messages
        ${filter.where}
          AND ai_status IN ('warn', 'flagged', 'error')
        GROUP BY user_id
        ORDER BY flagged_count DESC
        LIMIT $${filter.params.length + 1}
      `,
      [...filter.params, limit],
    );

    return rows.map((r) => ({
      user_id: r.user_id as string,
      username: (r.username as string) ?? "",
      avatar_url: (r.avatar_url as string | null) ?? null,
      total_messages: Number(r.total_messages ?? 0),
      flagged_count: Number(r.flagged_count ?? 0),
      warned_count: Number(r.warned_count ?? 0),
      violation_score: Number(r.violation_score ?? 0),
      worst_flags: (r.worst_flags as string | null)
        ? (r.worst_flags as string)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      last_violation: Number(r.last_violation ?? 0),
    }));
  }

  async getUserLeaderboard(
    guildId: string,
    channelId?: string,
    hours = 24,
    limit = 10,
  ) {
    logger.debug(
      { guildId, channelId, hours, limit },
      "Getting user leaderboard",
    );
    const pool = getPool();
    const filter = buildTimeFilter(guildId, channelId, hours);

    const { rows } = await pool.query(
      `
        SELECT
          user_id,
          MAX(username)   AS username,
          MAX(avatar_url) AS avatar_url,
          COUNT(*)::int   AS message_count,
          COUNT(*) FILTER (WHERE type = 'edited')::int   AS edited_count,
          COUNT(*) FILTER (WHERE type = 'deleted')::int  AS deleted_count,
          COUNT(*) FILTER (WHERE ai_status IN ('warn', 'flagged', 'error'))::int AS flagged_count,
          MAX(created_at) AS last_active
        FROM messages
        ${filter.where}
        GROUP BY user_id
        ORDER BY message_count DESC
        LIMIT $${filter.params.length + 1}
      `,
      [...filter.params, limit],
    );

    return rows.map((r) => ({
      user_id: r.user_id as string,
      username: (r.username as string) ?? "",
      avatar_url: (r.avatar_url as string | null) ?? null,
      message_count: Number(r.message_count ?? 0),
      edited_count: Number(r.edited_count ?? 0),
      deleted_count: Number(r.deleted_count ?? 0),
      flagged_count: Number(r.flagged_count ?? 0),
      last_active: Number(r.last_active ?? 0),
    }));
  }

  async getModerationStats(guildId: string, channelId?: string, hours = 24) {
    logger.debug({ guildId, channelId, hours }, "Getting moderation stats");
    const pool = getPool();
    const filter = buildTimeFilter(guildId, channelId, hours);

    const { rows } = await pool.query(
      `
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE ai_status = 'clean')::int    AS clean,
          COUNT(*) FILTER (WHERE ai_status = 'warn')::int     AS warned,
          COUNT(*) FILTER (WHERE ai_status = 'flagged')::int  AS flagged,
          COUNT(*) FILTER (WHERE ai_status = 'error')::int    AS error,
          COUNT(*) FILTER (WHERE ai_status = 'pending')::int  AS pending,
          COALESCE(AVG(ai_moderation_score), 0)::real         AS average_score
        FROM messages
        ${filter.where}
      `,
      filter.params,
    );

    const row = rows[0] as Record<string, unknown> | undefined;

    return {
      total: Number(row?.total ?? 0),
      clean: Number(row?.clean ?? 0),
      warned: Number(row?.warned ?? 0),
      flagged: Number(row?.flagged ?? 0),
      error: Number(row?.error ?? 0),
      pending: Number(row?.pending ?? 0),
      average_score: Number(row?.average_score ?? 0),
    };
  }

  async getHeatmap(guildId: string, channelId?: string, hours = 24) {
    logger.debug({ guildId, channelId, hours }, "Getting heatmap data");
    const pool = getPool();
    const filter = buildTimeFilter(guildId, channelId, hours);

    const { rows } = await pool.query(
      `
        SELECT
          EXTRACT(DOW FROM to_timestamp(created_at / 1000))::int  AS day_of_week,
          EXTRACT(HOUR FROM to_timestamp(created_at / 1000))::int AS hour,
          COUNT(*)::int AS count,
          COUNT(*) FILTER (WHERE ai_status = 'clean')::int    AS clean,
          COUNT(*) FILTER (WHERE ai_status = 'warn')::int     AS warned,
          COUNT(*) FILTER (WHERE ai_status = 'flagged')::int  AS flagged
        FROM messages
        ${filter.where}
        GROUP BY day_of_week, hour
        ORDER BY day_of_week, hour
      `,
      filter.params,
    );

    return rows.map((r) => ({
      dayOfWeek: Number(r.day_of_week ?? 0),
      hour: Number(r.hour ?? 0),
      count: Number(r.count ?? 0),
      clean: Number(r.clean ?? 0),
      warned: Number(r.warned ?? 0),
      flagged: Number(r.flagged ?? 0),
    }));
  }

  async getTopics(guildId: string, channelId?: string, hours = 24) {
    logger.debug({ guildId, channelId, hours }, "Getting topics");
    const pool = getPool();
    const filter = buildTimeFilter(guildId, channelId, hours);

    const { rows } = await pool.query(
      `
        SELECT
          TRIM(UNNEST(STRING_TO_ARRAY(ai_categories, ','))) AS topic,
          COUNT(*)::int AS count,
          COALESCE(AVG(ai_moderation_score), 0)::real AS score
        FROM messages
        ${filter.where}
          AND ai_categories IS NOT NULL
          AND ai_categories != ''
        GROUP BY topic
        ORDER BY count DESC
      `,
      filter.params,
    );

    return rows.map((r) => ({
      topic: (r.topic as string) ?? "",
      count: Number(r.count ?? 0),
      score: Number(r.score ?? 0),
    }));
  }

  // ── New endpoints ─────────────────────────────────────────────────────────

  async getModerationActions(
    guildId: string,
    channelId?: string,
    hours = 24,
    limit = 20,
  ) {
    logger.debug(
      { guildId, channelId, hours, limit },
      "Getting moderation actions",
    );
    const pool = getPool();
    const filter = buildTimeFilter(guildId, channelId, hours);

    const { rows } = await pool.query(
      `
        SELECT
          ma.id,
          ma.message_id,
          ma.user_id,
          ma.guild_id,
          ma.action_type,
          ma.reason,
          ma.executed_by,
          ma.status,
          ma.error,
          ma.created_at,
          ma.executed_at,
          m.username,
          m.content
        FROM moderation_actions ma
        LEFT JOIN messages m ON m.id = ma.message_id
        ${filter.where.replace("guild_id", "ma.guild_id").replace("created_at", "ma.created_at")}
        ORDER BY ma.created_at DESC
        LIMIT $${filter.params.length + 1}
      `,
      [...filter.params, limit],
    );

    return rows.map((r) => ({
      id: r.id as string,
      message_id: (r.message_id as string) ?? null,
      user_id: r.user_id as string,
      guild_id: r.guild_id as string,
      action_type: r.action_type as string,
      reason: (r.reason as string) ?? null,
      executed_by: (r.executed_by as string) ?? null,
      status: r.status as string,
      error: (r.error as string) ?? null,
      created_at: Number(r.created_at ?? 0),
      executed_at: r.executed_at ? Number(r.executed_at) : null,
      username: (r.username as string) ?? "Unknown",
      content: (r.content as string) ?? null,
    }));
  }

  async getAIStats(guildId: string, channelId?: string, hours = 24) {
    logger.debug({ guildId, channelId, hours }, "Getting AI stats");
    const pool = getPool();
    const filter = buildTimeFilter(guildId, channelId, hours);

    const { rows } = await pool.query(
      `
        SELECT
          COUNT(*)::int AS total_analyzed,
          COUNT(*) FILTER (WHERE ai_severity = 'none')::int    AS severity_none,
          COUNT(*) FILTER (WHERE ai_severity = 'low')::int     AS severity_low,
          COUNT(*) FILTER (WHERE ai_severity = 'medium')::int  AS severity_medium,
          COUNT(*) FILTER (WHERE ai_severity = 'high')::int    AS severity_high,
          COUNT(*) FILTER (WHERE ai_severity = 'critical')::int AS severity_critical,
          COUNT(*) FILTER (WHERE ai_recommended_action = 'none')::int     AS action_none,
          COUNT(*) FILTER (WHERE ai_recommended_action = 'monitor')::int  AS action_monitor,
          COUNT(*) FILTER (WHERE ai_recommended_action = 'warn')::int     AS action_warn,
          COUNT(*) FILTER (WHERE ai_recommended_action = 'review')::int   AS action_review,
          COUNT(*) FILTER (WHERE ai_recommended_action = 'delete')::int   AS action_delete,
          COUNT(*) FILTER (WHERE ai_recommended_action = 'escalate')::int AS action_escalate,
          COUNT(*) FILTER (WHERE ai_status = 'error')::int      AS analysis_errors,
          COUNT(*) FILTER (WHERE ai_status = 'pending')::int    AS analysis_pending,
          COALESCE(AVG(ai_confidence), 0)::real                 AS avg_confidence,
          COALESCE(AVG(ai_moderation_score), 0)::real           AS avg_score
        FROM messages
        ${filter.where}
      `,
      filter.params,
    );

    const row = rows[0] as Record<string, unknown> | undefined;

    return {
      total_analyzed: Number(row?.total_analyzed ?? 0),
      severity: {
        none: Number(row?.severity_none ?? 0),
        low: Number(row?.severity_low ?? 0),
        medium: Number(row?.severity_medium ?? 0),
        high: Number(row?.severity_high ?? 0),
        critical: Number(row?.severity_critical ?? 0),
      },
      recommended_actions: {
        none: Number(row?.action_none ?? 0),
        monitor: Number(row?.action_monitor ?? 0),
        warn: Number(row?.action_warn ?? 0),
        review: Number(row?.action_review ?? 0),
        delete: Number(row?.action_delete ?? 0),
        escalate: Number(row?.action_escalate ?? 0),
      },
      analysis_errors: Number(row?.analysis_errors ?? 0),
      analysis_pending: Number(row?.analysis_pending ?? 0),
      avg_confidence: Number(row?.avg_confidence ?? 0),
      avg_score: Number(row?.avg_score ?? 0),
    };
  }

  async getAttachmentStats(guildId: string, channelId?: string, hours = 24) {
    logger.debug({ guildId, channelId, hours }, "Getting attachment stats");
    const pool = getPool();
    const filter = buildTimeFilter(guildId, channelId, hours);

    const { rows } = await pool.query(
      `
        SELECT
          COUNT(*)::int AS total_attachments,
          COUNT(*) FILTER (WHERE a.upload_status = 'uploaded')::int  AS uploaded,
          COUNT(*) FILTER (WHERE a.upload_status = 'pending')::int   AS pending,
          COUNT(*) FILTER (WHERE a.upload_status = 'failed')::int    AS failed,
          COALESCE(SUM(a.size), 0)::bigint                           AS total_size_bytes,
          COUNT(DISTINCT a.user_id)::int                             AS unique_uploaders,
          (SELECT a2.type FROM attachments a2
           WHERE a2.guild_id = $1
           ${channelId ? "AND a2.channel_id = $" + (filter.paramOffset - 1) : ""}
           AND a2.created_at > (EXTRACT(EPOCH FROM NOW()) * 1000 - $${filter.paramOffset})
           GROUP BY a2.type ORDER BY COUNT(*) DESC LIMIT 1
          ) AS top_mime_type
        FROM attachments a
        WHERE a.guild_id = $1
          ${channelId ? "AND a.channel_id = $" + (filter.paramOffset - 1) : ""}
          AND a.created_at > (EXTRACT(EPOCH FROM NOW()) * 1000 - $${filter.paramOffset})
      `,
      channelId
        ? [guildId, channelId, hours * 3_600_000]
        : [guildId, hours * 3_600_000],
    );

    const row = rows[0] as Record<string, unknown> | undefined;

    return {
      total_attachments: Number(row?.total_attachments ?? 0),
      uploaded: Number(row?.uploaded ?? 0),
      pending: Number(row?.pending ?? 0),
      failed: Number(row?.failed ?? 0),
      total_size_bytes: Number(row?.total_size_bytes ?? 0),
      unique_uploaders: Number(row?.unique_uploaders ?? 0),
      top_mime_type: (row?.top_mime_type as string) ?? null,
    };
  }
}

export const analyticsRepository = new AnalyticsRepository();
