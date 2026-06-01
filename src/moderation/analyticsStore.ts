import { executeAll, executeGet } from "../database/drizzle.js";
import { createChildLogger } from "../logger.js";
import type { MessageRecord } from "./types.js";

const logger = createChildLogger("analytics-store");

// ── Types ──────────────────────────────────────────────────────────────

export interface HourlyBucket {
  hour: string;
  count: number;
  clean: number;
  warned: number;
  flagged: number;
  error: number;
}

export interface TopicTrend {
  topic: string;
  count: number;
  score: number;
}

export interface UserStat {
  user_id: string;
  username: string;
  avatar_url: string | null;
  message_count: number;
  edited_count: number;
  deleted_count: number;
  flagged_count: number;
  last_active: number;
}

export interface ModerationBreakdown {
  total: number;
  clean: number;
  warned: number;
  flagged: number;
  error: number;
  pending: number;
  average_score: number;
}

export interface AnalyticsOverview {
  period: { start: number; end: number };
  messages: ModerationBreakdown;
  hourly: HourlyBucket[];
  topics: TopicTrend[];
  top_users: UserStat[];
  active_users_count: number;
  total_channels: number;
}

// ══════════════════════════════════════════════════════════════════════════
// GENERIC QUERY CACHE (reduces duplicate DB calls from 5s auto-refresh)
// ══════════════════════════════════════════════════════════════════════════

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const queryCache = new Map<string, CacheEntry<any>>();

/** Default TTL for aggregate queries — 10s is long enough to prevent redundant
 *  calls from the 5s auto-refresh but short enough to feel real-time. */
const AGGREGATE_CACHE_TTL_MS = 10_000;

/** Topic extraction is expensive (JSON parsing). Cache longer. */
const TOPIC_CACHE_TTL_MS = 120_000;

function makeCacheKey(prefix: string, params: Record<string, any>): string {
  return `${prefix}:${JSON.stringify(params)}`;
}

function getCached<T>(key: string): T | undefined {
  const entry = queryCache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.data;
  if (entry) queryCache.delete(key); // expired
  return undefined;
}

function setCache<T>(key: string, data: T, ttl: number): void {
  queryCache.set(key, { data, expiresAt: Date.now() + ttl });
  // Prune old entries if cache grows too large (>200 entries)
  if (queryCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of queryCache) {
      if (v.expiresAt <= now) queryCache.delete(k);
    }
  }
}

// ── Hourly Message Stats ───────────────────────────────────────────────

export async function getHourlyStats(input: {
  guildId: string;
  channelId?: string;
  hours?: number;
}): Promise<HourlyBucket[]> {
  const { guildId, channelId, hours = 24 } = input;
  const cacheKey = makeCacheKey("hourly", { guildId, channelId, hours });
  const cached = getCached<HourlyBucket[]>(cacheKey);
  if (cached) return cached;

  try {
    const since = Date.now() - hours * 3600_000;
    const hourExpr = `to_char(to_timestamp((created_at / 3600000) * 3600), 'YYYY-MM-DD HH24:MI:SS') as hour`;

    const rows = await executeAll(
      `
      SELECT
        ${hourExpr},
        count(*) as count,
        count(case when ai_status = 'clean' then 1 end) as clean,
        count(case when ai_status = 'warn' then 1 end) as warned,
        count(case when ai_status = 'flagged' then 1 end) as flagged,
        count(case when ai_status = 'error' then 1 end) as error
      FROM messages
      WHERE guild_id = ?
        AND created_at >= ?
        AND deleted_at IS NULL
        ${channelId ? `AND (channel_id = ? OR thread_id = ?)` : ""}
      GROUP BY (created_at / 3600000)
      ORDER BY hour ASC
      `,
      channelId ? [guildId, since, channelId, channelId] : [guildId, since],
    );

    // Initialize all hour buckets (fill gaps with zeros)
    const buckets = new Map<
      string,
      {
        count: number;
        clean: number;
        warned: number;
        flagged: number;
        error: number;
      }
    >();

    for (let h = 0; h < hours; h++) {
      const ts = new Date(since + h * 3600_000);
      ts.setMinutes(0, 0, 0);
      const key = ts.toISOString().slice(0, 13) + ":00:00Z";
      buckets.set(key, { count: 0, clean: 0, warned: 0, flagged: 0, error: 0 });
    }

    for (const row of rows) {
      const d = new Date(row.hour.replace(" ", "T") + "Z");
      const key = d.toISOString().slice(0, 13) + ":00:00Z";
      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.count = row.count;
      bucket.clean = row.clean;
      bucket.warned = row.warned;
      bucket.flagged = row.flagged;
      bucket.error = row.error;
    }

    const result = Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, data]) => ({ hour, ...data }));

    setCache(cacheKey, result, AGGREGATE_CACHE_TTL_MS);
    return result;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to get hourly stats",
    );
    return [];
  }
}

// ── Topic Trends ───────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "yang",
  "dan",
  "itu",
  "ini",
  "dengan",
  "akan",
  "pada",
  "dari",
  "di",
  "ke",
  "untuk",
  "tidak",
  "ada",
  "juga",
  "sudah",
  "saya",
  "kamu",
  "dia",
  "mereka",
  "kami",
  "aku",
  "lo",
  "lu",
  "gua",
  "gue",
  "org",
  "orang",
  "aja",
  "sama",
  "kalo",
  "kalau",
  "bisa",
  "karena",
  "gak",
  "nggak",
  "ga",
  "tak",
  "belum",
  "udah",
  "dah",
  "lah",
  "kah",
  "pun",
  "nih",
  "tuh",
  "deh",
  "dong",
  "si",
  "nya",
  "kan",
  "ya",
  "yah",
  "yuk",
  "kok",
  "loh",
  "nah",
  "wow",
  "eh",
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "having",
  "do",
  "does",
  "did",
  "doing",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "shall",
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  "me",
  "him",
  "her",
  "us",
  "them",
  "my",
  "your",
  "his",
  "its",
  "our",
  "their",
  "and",
  "but",
  "or",
  "nor",
  "not",
  "so",
  "yet",
  "for",
  "if",
  "to",
  "of",
  "in",
  "on",
  "at",
  "by",
  "as",
  "with",
  "about",
  "just",
  "then",
  "now",
  "here",
  "there",
  "when",
  "where",
  "why",
  "how",
  "all",
  "both",
  "each",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "only",
  "own",
  "same",
  "too",
  "very",
  "can",
  "go",
  "ok",
  "okay",
  "yeah",
  "yes",
  "no",
]);

function extractTopics(messages: MessageRecord[], topN = 15): TopicTrend[] {
  const topicScores = new Map<string, { count: number; score: number }>();
  const wordFreq = new Map<string, number>();
  const flaggedWordFreq = new Map<string, number>();

  for (const msg of messages) {
    if (msg.ai_analysis) {
      try {
        const analysis = JSON.parse(msg.ai_analysis);
        const topics = analysis.topics;
        if (topics && Array.isArray(topics)) {
          for (const topic of topics) {
            const key =
              typeof topic === "string" ? topic : topic.name || topic.topic;
            if (!key) continue;
            const k = key.toLowerCase();
            const score = msg.ai_moderation_score || 0;
            const existing = topicScores.get(k);
            if (existing) {
              existing.count++;
              existing.score += score;
            } else {
              topicScores.set(k, { count: 1, score });
            }
          }
        }
        if (analysis.category) {
          const cat = String(analysis.category).toLowerCase();
          const existing = topicScores.get(cat);
          if (existing) {
            existing.count++;
            existing.score += msg.ai_moderation_score || 0;
          } else {
            topicScores.set(cat, {
              count: 1,
              score: msg.ai_moderation_score || 0,
            });
          }
        }
      } catch {
        /* not valid JSON */
      }
    }

    if (msg.content) {
      const words = msg.content
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

      for (const word of words) {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
        if (msg.ai_status === "flagged" || msg.ai_status === "warn") {
          flaggedWordFreq.set(word, (flaggedWordFreq.get(word) || 0) + 1);
        }
      }
    }
  }

  const results: TopicTrend[] = [];
  for (const [topic, data] of topicScores) {
    results.push({ topic, count: data.count, score: data.score });
  }

  const sortedWords = Array.from(wordFreq.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN);

  for (const [word, count] of sortedWords) {
    if (!topicScores.has(word)) {
      results.push({
        topic: word,
        count,
        score: flaggedWordFreq.get(word) || 0,
      });
    }
  }

  return results.sort((a, b) => b.count - a.count).slice(0, topN);
}

export async function getTopicTrends(input: {
  guildId: string;
  channelId?: string;
  hours?: number;
}): Promise<TopicTrend[]> {
  const { guildId, channelId, hours = 24 } = input;
  const cacheKey = makeCacheKey("topics", { guildId, channelId, hours });
  const cached = getCached<TopicTrend[]>(cacheKey);
  if (cached) return cached;

  try {
    const since = Date.now() - hours * 3600_000;

    // Fetch all analyzed messages within the time window (no hard row cap).
    // Messages without ai_analysis are excluded which naturally limits rows.
    const rows = (await executeAll(
      `
      SELECT
        id, content, ai_status, ai_analysis, ai_moderation_score,
        ai_moderation_flags, created_at
      FROM messages
      WHERE guild_id = ?
        AND created_at >= ?
        AND deleted_at IS NULL
        AND ai_analysis IS NOT NULL
        ${channelId ? `AND (channel_id = ? OR thread_id = ?)` : ""}
      ORDER BY created_at DESC
      `,
      channelId ? [guildId, since, channelId, channelId] : [guildId, since],
    )) as MessageRecord[];

    const result = extractTopics(rows);
    setCache(cacheKey, result, TOPIC_CACHE_TTL_MS);
    return result;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to get topic trends",
    );
    return [];
  }
}

// ── User Leaderboard ────────────────────────────────────────────────────

export async function getUserLeaderboard(input: {
  guildId: string;
  channelId?: string;
  hours?: number;
  limit?: number;
}): Promise<UserStat[]> {
  const { guildId, channelId, hours = 24, limit = 20 } = input;
  const cacheKey = makeCacheKey("leaderboard", {
    guildId,
    channelId,
    hours,
    limit,
  });
  const cached = getCached<UserStat[]>(cacheKey);
  if (cached) return cached;

  try {
    const since = Date.now() - hours * 3600_000;
    const rows = await executeAll(
      `
      SELECT
        user_id,
        username,
        avatar_url,
        count(*) as message_count,
        count(case when type = 'edited' then 1 end) as edited_count,
        count(case when type = 'deleted' then 1 end) as deleted_count,
        count(case when ai_status in ('flagged', 'warn') then 1 end) as flagged_count,
        max(created_at) as last_active
      FROM messages
      WHERE guild_id = ?
        AND created_at >= ?
        AND deleted_at IS NULL
        ${channelId ? `AND (channel_id = ? OR thread_id = ?)` : ""}
      GROUP BY user_id, username, avatar_url
      ORDER BY message_count DESC
      LIMIT ?
      `,
      channelId
        ? [guildId, since, channelId, channelId, limit]
        : [guildId, since, limit],
    );

    const result = rows as UserStat[];
    setCache(cacheKey, result, AGGREGATE_CACHE_TTL_MS);
    return result;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to get user leaderboard",
    );
    return [];
  }
}

// ── Moderation Stats ───────────────────────────────────────────────────

export async function getModerationStats(input: {
  guildId: string;
  channelId?: string;
  hours?: number;
}): Promise<ModerationBreakdown> {
  const { guildId, channelId, hours = 24 } = input;
  const cacheKey = makeCacheKey("modstats", { guildId, channelId, hours });
  const cached = getCached<ModerationBreakdown>(cacheKey);
  if (cached) return cached;

  try {
    const since = Date.now() - hours * 3600_000;
    const avgScoreExpr = `round(avg(ai_moderation_score)::numeric, 2)`;

    const row = await executeGet(
      `
      SELECT
        count(*) as total,
        count(case when ai_status = 'clean' then 1 end) as clean,
        count(case when ai_status = 'warn' then 1 end) as warned,
        count(case when ai_status = 'flagged' then 1 end) as flagged,
        count(case when ai_status = 'error' then 1 end) as error,
        count(case when ai_status = 'pending' or ai_status IS NULL then 1 end) as pending,
        ${avgScoreExpr} as average_score
      FROM messages
      WHERE guild_id = ?
        AND created_at >= ?
        AND deleted_at IS NULL
        ${channelId ? `AND (channel_id = ? OR thread_id = ?)` : ""}
      `,
      channelId ? [guildId, since, channelId, channelId] : [guildId, since],
    );

    const result: ModerationBreakdown = row
      ? {
          total: row.total ?? 0,
          clean: row.clean ?? 0,
          warned: row.warned ?? 0,
          flagged: row.flagged ?? 0,
          error: row.error ?? 0,
          pending: row.pending ?? 0,
          average_score: row.average_score ?? 0,
        }
      : {
          total: 0,
          clean: 0,
          warned: 0,
          flagged: 0,
          error: 0,
          pending: 0,
          average_score: 0,
        };

    setCache(cacheKey, result, AGGREGATE_CACHE_TTL_MS);
    return result;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to get moderation stats",
    );
    return {
      total: 0,
      clean: 0,
      warned: 0,
      flagged: 0,
      error: 0,
      pending: 0,
      average_score: 0,
    };
  }
}

// ── Active Channels Count ──────────────────────────────────────────────

export async function getActiveChannelCount(input: {
  guildId: string;
  hours?: number;
}): Promise<number> {
  const { guildId, hours = 24 } = input;
  const cacheKey = makeCacheKey("channels", { guildId, hours });
  const cached = getCached<number>(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const since = Date.now() - hours * 3600_000;
    const row = await executeGet(
      `
      SELECT count(DISTINCT channel_id) as cnt
      FROM messages
      WHERE guild_id = ?
        AND created_at >= ?
        AND deleted_at IS NULL
      `,
      [guildId, since],
    );

    const result = row?.cnt ?? 0;
    setCache(cacheKey, result, AGGREGATE_CACHE_TTL_MS);
    return result;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to get active channel count",
    );
    return 0;
  }
}

// ── Top Violators ─────────────────────────────────────────────────────

export interface ViolatorStat {
  user_id: string;
  username: string;
  avatar_url: string | null;
  total_messages: number;
  flagged_count: number;
  warned_count: number;
  violation_score: number;
  worst_flags: string[];
  last_violation: number;
}

export async function getTopViolators(input: {
  guildId: string;
  channelId?: string;
  hours?: number;
  limit?: number;
}): Promise<ViolatorStat[]> {
  const { guildId, channelId, hours = 24, limit = 20 } = input;
  const cacheKey = makeCacheKey("violators", {
    guildId,
    channelId,
    hours,
    limit,
  });
  const cached = getCached<ViolatorStat[]>(cacheKey);
  if (cached) return cached;

  try {
    const since = Date.now() - hours * 3600_000;
    const rows = await executeAll(
      `
      SELECT
        user_id,
        username,
        avatar_url,
        count(*) as total_messages,
        count(case when ai_status = 'flagged' then 1 end) as flagged_count,
        count(case when ai_status = 'warn' then 1 end) as warned_count,
        max(case when ai_status in ('flagged', 'warn') then created_at else 0 end) as last_violation
      FROM messages
      WHERE guild_id = ?
        AND created_at >= ?
        AND deleted_at IS NULL
        ${channelId ? `AND (channel_id = ? OR thread_id = ?)` : ""}
      GROUP BY user_id, username, avatar_url
      HAVING count(case when ai_status = 'flagged' then 1 end) > 0
         OR count(case when ai_status = 'warn' then 1 end) > 0
      ORDER BY (
        count(case when ai_status = 'flagged' then 1 end) * 3
        + count(case when ai_status = 'warn' then 1 end)
      ) DESC
      LIMIT ?
      `,
      channelId
        ? [guildId, since, channelId, channelId, limit]
        : [guildId, since, limit],
    );

    const violators: ViolatorStat[] = rows.map((row: any) => ({
      user_id: row.user_id,
      username: row.username,
      avatar_url: row.avatar_url,
      total_messages: row.total_messages,
      flagged_count: row.flagged_count,
      warned_count: row.warned_count,
      violation_score: row.flagged_count * 3 + row.warned_count,
      worst_flags: [],
      last_violation: row.last_violation,
    }));

    setCache(cacheKey, violators, AGGREGATE_CACHE_TTL_MS);
    return violators;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to get top violators",
    );
    return [];
  }
}

// ── Daily Trend (for multi-day line chart) ────────────────────────────

export interface TrendBucket {
  date: string;
  count: number;
  clean: number;
  warned: number;
  flagged: number;
  error: number;
}

export async function getDailyTrend(input: {
  guildId: string;
  channelId?: string;
  hours?: number;
}): Promise<TrendBucket[]> {
  const { guildId, channelId, hours = 168 } = input;
  const cacheKey = makeCacheKey("daily_trend", { guildId, channelId, hours });
  const cached = getCached<TrendBucket[]>(cacheKey);
  if (cached) return cached;

  try {
    const since = Date.now() - hours * 3600_000;
    const dateExpr = `to_char(date_trunc('day', to_timestamp(created_at / 1000)), 'YYYY-MM-DD') as date`;

    const rows = await executeAll(
      `
      SELECT
        ${dateExpr},
        count(*) as count,
        count(case when ai_status = 'clean' then 1 end) as clean,
        count(case when ai_status = 'warn' then 1 end) as warned,
        count(case when ai_status = 'flagged' then 1 end) as flagged,
        count(case when ai_status = 'error' then 1 end) as error
      FROM messages
      WHERE guild_id = ?
        AND created_at >= ?
        AND deleted_at IS NULL
        ${channelId ? `AND (channel_id = ? OR thread_id = ?)` : ""}
      GROUP BY 1
      ORDER BY 1 ASC
      `,
      channelId ? [guildId, since, channelId, channelId] : [guildId, since],
    );

    // Initialize all day buckets (fill gaps with zeros)
    const buckets = new Map<
      string,
      {
        count: number;
        clean: number;
        warned: number;
        flagged: number;
        error: number;
      }
    >();
    const msPerDay = 86400_000;
    const startDay = Math.floor(since / msPerDay) * msPerDay;
    const endDay = Math.floor(Date.now() / msPerDay) * msPerDay;

    for (let d = startDay; d <= endDay; d += msPerDay) {
      const key = new Date(d).toISOString().slice(0, 10);
      buckets.set(key, { count: 0, clean: 0, warned: 0, flagged: 0, error: 0 });
    }

    for (const row of rows) {
      const bucket = buckets.get(row.date);
      if (!bucket) continue;
      bucket.count = row.count;
      bucket.clean = row.clean;
      bucket.warned = row.warned;
      bucket.flagged = row.flagged;
      bucket.error = row.error;
    }

    const result = Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    setCache(cacheKey, result, AGGREGATE_CACHE_TTL_MS);
    return result;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to get daily trend",
    );
    return [];
  }
}

// ── Activity Heatmap (day-of-week × hour-of-day) ──────────────────────

export interface HeatmapCell {
  dayOfWeek: number; // 0=Senin, 6=Minggu
  hour: number; // 0-23
  count: number;
  clean: number;
  warned: number;
  flagged: number;
}

export async function getActivityHeatmap(input: {
  guildId: string;
  channelId?: string;
  hours?: number;
}): Promise<HeatmapCell[]> {
  const { guildId, channelId, hours = 168 } = input;
  const cacheKey = makeCacheKey("heatmap", { guildId, channelId, hours });
  const cached = getCached<HeatmapCell[]>(cacheKey);
  if (cached) return cached;

  try {
    const since = Date.now() - hours * 3600_000;
    const dayExpr = `(extract(isodow from to_timestamp(created_at / 1000)) % 7)::int as day_of_week`;
    const hourExpr = `extract(hour from to_timestamp(created_at / 1000))::int as hour`;

    const rows = await executeAll(
      `
      SELECT
        ${dayExpr},
        ${hourExpr},
        count(*) as count,
        count(case when ai_status = 'clean' then 1 end) as clean,
        count(case when ai_status = 'warn' then 1 end) as warned,
        count(case when ai_status = 'flagged' then 1 end) as flagged
      FROM messages
      WHERE guild_id = ?
        AND created_at >= ?
        AND deleted_at IS NULL
        ${channelId ? `AND (channel_id = ? OR thread_id = ?)` : ""}
      GROUP BY day_of_week, hour
      ORDER BY day_of_week, hour
      `,
      channelId ? [guildId, since, channelId, channelId] : [guildId, since],
    );

    // Initialize all 7×24 cells with zeros
    const cells = new Map<
      string,
      { count: number; clean: number; warned: number; flagged: number }
    >();
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        cells.set(`${d}-${h}`, { count: 0, clean: 0, warned: 0, flagged: 0 });
      }
    }

    for (const row of rows) {
      const key = `${row.day_of_week}-${row.hour}`;
      const cell = cells.get(key);
      if (!cell) continue;
      cell.count = row.count;
      cell.clean = row.clean;
      cell.warned = row.warned;
      cell.flagged = row.flagged;
    }

    const result = Array.from(cells.entries())
      .map(([key, data]) => {
        const [dayOfWeek, hour] = key.split("-").map(Number);
        return { dayOfWeek, hour, ...data };
      })
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.hour - b.hour);

    setCache(cacheKey, result, AGGREGATE_CACHE_TTL_MS);
    return result;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to get activity heatmap",
    );
    return [];
  }
}

// ── Cache Invalidation (called when new messages arrive) ───────────────

export function invalidateAnalyticsCache(guildId: string): void {
  const now = Date.now();
  const needle = `"${guildId}"`;
  for (const [key, entry] of queryCache) {
    if (key.includes(needle) && entry.expiresAt > now) {
      entry.expiresAt = 0; // expire immediately
    }
  }
}

// ── Combined Overview ──────────────────────────────────────────────────

export async function getAnalyticsOverview(input: {
  guildId: string;
  channelId?: string;
  hours?: number;
}): Promise<AnalyticsOverview> {
  const { guildId, hours = 24 } = input;
  const now = Date.now();
  const since = now - hours * 3600_000;

  const [messages, hourly, topics, topUsers, totalChannels] = await Promise.all(
    [
      getModerationStats(input),
      getHourlyStats(input),
      getTopicTrends(input),
      getUserLeaderboard(input),
      getActiveChannelCount({ guildId, hours }),
    ],
  );

  return {
    period: { start: since, end: now },
    messages,
    hourly,
    topics,
    top_users: topUsers,
    active_users_count: topUsers.length,
    total_channels: totalChannels,
  };
}
