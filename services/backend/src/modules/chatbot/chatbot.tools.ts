import { and, desc, eq, like, sql } from "drizzle-orm";
import { createChildLogger } from "@/shared/logger/index";
import { getDatabase } from "../../shared/database/index.js";
import {
  pgChannelCulturesTable,
  pgCorrectedModerationsTable,
  pgMessageReviewsTable,
  pgMessagesTable,
  pgUserProfilesTable,
  pgVoiceRecordingsTable,
} from "../../shared/index.js";

/**
 * Executor for the chatbot's server-watcher tools. The tool *definitions*
 * live in chatbot.toolDefs.ts (no DB import); this file implements each one
 * against the real database.
 *
 * All queries use parameterized drizzle operators (eq/like/and) — never string
 * interpolation into raw SQL — so model-supplied arguments cannot inject SQL.
 */

export type ToolResult = string;

const logger = createChildLogger("chatbot.tools");

/** Saturating counter of chatbot tool execution errors (for observability). */
export let toolErrors = 0;
const TOOL_ERROR_CAP = 1000;

function toolExecError(err: unknown, name: string): string {
  if (toolErrors < TOOL_ERROR_CAP) toolErrors++;
  const detail = (err as Error)?.message ?? "unknown";
  logger.warn({ tool: name, error: detail }, "Chatbot tool execution failed");
  return `Tool ${name} gagal: ${detail}`;
}

/** Executes a tool call against the real DB and returns a readable result. */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const guildId =
    typeof args.guildId === "string" && args.guildId ? args.guildId : undefined;
  const channelId =
    typeof args.channelId === "string" && args.channelId
      ? args.channelId
      : undefined;
  const userId =
    typeof args.userId === "string" && args.userId ? args.userId : undefined;
  const limitRaw =
    typeof args.limit === "number" ? args.limit : Number(args.limit) || 5;
  const limit = Math.min(Math.max(1, Math.round(limitRaw)), 20);

  try {
    switch (name) {
      case "get_server_stats":
        return await serverStats(guildId, channelId);
      case "get_top_channels":
        return await topChannels(guildId, limit);
      case "get_recent_activity":
        return await recentActivity(guildId, channelId, limit);
      case "get_top_flagged":
        return await topFlagged(guildId, channelId, limit);
      case "search_messages":
        return await searchMessages(
          String(args.query ?? ""),
          guildId,
          channelId,
          limit,
        );
      case "get_user_messages":
        return await userMessages(userId, guildId, channelId, limit);
      case "get_user_profile":
        return await userProfile(userId, guildId);
      case "get_user_reputation":
        return await userReputation(userId, guildId);
      case "get_channel_culture":
        return await channelCulture(
          typeof args.channelId === "string" ? args.channelId : undefined,
        );
      case "get_message_detail":
        return await messageDetail(
          typeof args.messageId === "string" ? args.messageId : undefined,
        );
      case "get_message_reviews":
        return await messageReviews(
          guildId,
          typeof args.status === "string" ? args.status : undefined,
          limit,
        );
      case "get_voice_recordings":
        return await voiceRecordings(userId, channelId, guildId, limit);
      case "get_moderation_timeline":
        return await moderationTimeline(
          guildId,
          channelId,
          typeof args.days === "number"
            ? Math.min(Math.max(1, args.days), 60)
            : 14,
        );
      case "get_corrections":
        return await corrections(guildId, limit);
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (error) {
    // Best-effort: if a tool fails, return readable error instead of crashing
    return toolExecError(error, name);
  }
}

// ── Query helpers ──────────────────────────────────────────

function scopeMessages(
  guildId?: string,
  channelId?: string,
): ReturnType<typeof and> | undefined {
  const conds = [];
  if (guildId) conds.push(eq(pgMessagesTable.guild_id, guildId));
  if (channelId) conds.push(eq(pgMessagesTable.channel_id, channelId));
  return conds.length ? and(...conds) : undefined;
}

/** Escape LIKE wildcards so user input can't break the pattern. */
function likePattern(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// ── Tool executors ──────────────────────────────────────────

async function serverStats(
  guildId?: string,
  channelId?: string,
): Promise<string> {
  const db = getDatabase();
  const [result] = await db
    .select({
      total_messages: sql<number>`COUNT(*)::int`,
      active_users: sql<number>`COUNT(DISTINCT ${pgMessagesTable.user_id})::int`,
      flagged: sql<number>`COUNT(*) FILTER (WHERE ${pgMessagesTable.ai_status} = 'flagged')::int`,
      warned: sql<number>`COUNT(*) FILTER (WHERE ${pgMessagesTable.ai_status} = 'warn')::int`,
      clean: sql<number>`COUNT(*) FILTER (WHERE ${pgMessagesTable.ai_status} = 'clean')::int`,
    })
    .from(pgMessagesTable)
    .where(scopeMessages(guildId, channelId));

  const r = result ?? {
    total_messages: 0,
    active_users: 0,
    flagged: 0,
    warned: 0,
    clean: 0,
  };
  return JSON.stringify(r);
}

async function topChannels(guildId?: string, limit = 5): Promise<string> {
  const db = getDatabase();
  const rows = await db
    .select({
      channel_id: pgMessagesTable.channel_id,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(pgMessagesTable)
    .where(scopeMessages(guildId))
    .groupBy(pgMessagesTable.channel_id)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(limit);
  return JSON.stringify(rows);
}

async function recentActivity(
  guildId?: string,
  channelId?: string,
  limit = 5,
): Promise<string> {
  const db = getDatabase();
  const rows = await db
    .select({
      id: pgMessagesTable.id,
      username: pgMessagesTable.username,
      user_id: pgMessagesTable.user_id,
      channel_id: pgMessagesTable.channel_id,
      content: pgMessagesTable.content,
      created_at: pgMessagesTable.created_at,
      ai_status: pgMessagesTable.ai_status,
    })
    .from(pgMessagesTable)
    .where(scopeMessages(guildId, channelId))
    .orderBy(desc(pgMessagesTable.created_at))
    .limit(limit);
  return JSON.stringify(rows);
}

async function topFlagged(
  guildId?: string,
  channelId?: string,
  limit = 5,
): Promise<string> {
  const db = getDatabase();
  const rows = await db
    .select({
      id: pgMessagesTable.id,
      username: pgMessagesTable.username,
      channel_id: pgMessagesTable.channel_id,
      content: pgMessagesTable.content,
      ai_status: pgMessagesTable.ai_status,
      ai_severity: pgMessagesTable.ai_severity,
      ai_moderation_flags: pgMessagesTable.ai_moderation_flags,
      ai_analysis: pgMessagesTable.ai_analysis,
      created_at: pgMessagesTable.created_at,
    })
    .from(pgMessagesTable)
    .where(
      and(
        scopeMessages(guildId, channelId),
        eq(pgMessagesTable.ai_status, "flagged"),
      ),
    )
    .orderBy(desc(pgMessagesTable.created_at))
    .limit(limit);
  return JSON.stringify(rows);
}

async function searchMessages(
  query: string,
  guildId?: string,
  channelId?: string,
  limit = 5,
): Promise<string> {
  const db = getDatabase();
  if (!query.trim()) return JSON.stringify({ error: "query kosong" });
  const rows = await db
    .select({
      id: pgMessagesTable.id,
      username: pgMessagesTable.username,
      channel_id: pgMessagesTable.channel_id,
      content: pgMessagesTable.content,
      created_at: pgMessagesTable.created_at,
      ai_status: pgMessagesTable.ai_status,
    })
    .from(pgMessagesTable)
    .where(
      and(
        scopeMessages(guildId, channelId),
        like(pgMessagesTable.content, `%${likePattern(query)}%`),
      ),
    )
    .orderBy(desc(pgMessagesTable.created_at))
    .limit(limit);
  return JSON.stringify(rows);
}

async function userMessages(
  userId?: string,
  guildId?: string,
  channelId?: string,
  limit = 10,
): Promise<string> {
  const db = getDatabase();
  if (!userId) return JSON.stringify({ error: "userId wajib" });
  const conds = [eq(pgMessagesTable.user_id, userId)];
  if (guildId) conds.push(eq(pgMessagesTable.guild_id, guildId));
  if (channelId) conds.push(eq(pgMessagesTable.channel_id, channelId));
  const rows = await db
    .select({
      id: pgMessagesTable.id,
      channel_id: pgMessagesTable.channel_id,
      content: pgMessagesTable.content,
      created_at: pgMessagesTable.created_at,
      ai_status: pgMessagesTable.ai_status,
    })
    .from(pgMessagesTable)
    .where(and(...conds))
    .orderBy(desc(pgMessagesTable.created_at))
    .limit(limit);
  return JSON.stringify(rows);
}

async function userProfile(userId?: string, guildId?: string): Promise<string> {
  const db = getDatabase();
  if (!userId) return JSON.stringify({ error: "userId wajib" });
  const conds = [eq(pgUserProfilesTable.user_id, userId)];
  if (guildId) conds.push(eq(pgUserProfilesTable.guild_id, guildId));
  const rows = await db
    .select({
      user_id: pgUserProfilesTable.user_id,
      guild_id: pgUserProfilesTable.guild_id,
      profile_summary: pgUserProfilesTable.profile_summary,
      last_analyzed_at: pgUserProfilesTable.last_analyzed_at,
    })
    .from(pgUserProfilesTable)
    .where(and(...conds))
    .limit(1);
  return JSON.stringify(rows[0] ?? { error: "profil tidak ditemukan" });
}

async function userReputation(
  _userId?: string,
  _guildId?: string,
): Promise<string> {
  // The per-user reputation feature (trust scores, streaks, infractions) was
  // removed from the gateway (migration 0016 drops user_reputations). Return
  // an honest "unavailable" answer from the derived moderation signals instead
  // of querying the now-dropped table.
  return JSON.stringify({
    available: false,
    message:
      "Skor trust/skala reputasi per-user telah dihapus dari sistem. Gunakan rasio pesan ter-flag vs total untuk menilai risiko (lihat dashboard Users).",
  });
}

async function channelCulture(channelId?: string): Promise<string> {
  const db = getDatabase();
  if (!channelId) return JSON.stringify({ error: "channelId wajib" });
  const rows = await db
    .select({
      channel_id: pgChannelCulturesTable.channel_id,
      culture_summary: pgChannelCulturesTable.culture_summary,
      last_analyzed_at: pgChannelCulturesTable.last_analyzed_at,
    })
    .from(pgChannelCulturesTable)
    .where(eq(pgChannelCulturesTable.channel_id, channelId))
    .limit(1);
  return JSON.stringify(rows[0] ?? { error: "culture tidak ditemukan" });
}

async function messageDetail(messageId?: string): Promise<string> {
  const db = getDatabase();
  if (!messageId) return JSON.stringify({ error: "messageId wajib" });
  const rows = await db
    .select({
      id: pgMessagesTable.id,
      guild_id: pgMessagesTable.guild_id,
      channel_id: pgMessagesTable.channel_id,
      user_id: pgMessagesTable.user_id,
      username: pgMessagesTable.username,
      content: pgMessagesTable.content,
      created_at: pgMessagesTable.created_at,
      ai_status: pgMessagesTable.ai_status,
      ai_moderation_flags: pgMessagesTable.ai_moderation_flags,
      ai_moderation_score: pgMessagesTable.ai_moderation_score,
      ai_severity: pgMessagesTable.ai_severity,
      ai_categories: pgMessagesTable.ai_categories,
      ai_analysis: pgMessagesTable.ai_analysis,
      ai_recommended_action: pgMessagesTable.ai_recommended_action,
      ai_confidence: pgMessagesTable.ai_confidence,
    })
    .from(pgMessagesTable)
    .where(eq(pgMessagesTable.id, messageId))
    .limit(1);
  return JSON.stringify(rows[0] ?? { error: "pesan tidak ditemukan" });
}

async function messageReviews(
  guildId?: string,
  status?: string,
  limit = 10,
): Promise<string> {
  const db = getDatabase();
  const conds = [];
  if (guildId) conds.push(eq(pgMessageReviewsTable.guild_id, guildId));
  if (status) conds.push(eq(pgMessageReviewsTable.status, status as never));
  const rows = await db
    .select({
      id: pgMessageReviewsTable.id,
      message_id: pgMessageReviewsTable.message_id,
      reviewer_id: pgMessageReviewsTable.reviewer_id,
      status: pgMessageReviewsTable.status,
      notes: pgMessageReviewsTable.notes,
      created_at: pgMessageReviewsTable.created_at,
      reviewed_at: pgMessageReviewsTable.reviewed_at,
    })
    .from(pgMessageReviewsTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(pgMessageReviewsTable.created_at))
    .limit(limit);
  return JSON.stringify(rows);
}

async function voiceRecordings(
  userId?: string,
  channelId?: string,
  guildId?: string,
  limit = 10,
): Promise<string> {
  const db = getDatabase();
  const conds = [];
  if (userId) conds.push(eq(pgVoiceRecordingsTable.user_id, userId));
  if (channelId) conds.push(eq(pgVoiceRecordingsTable.channel_id, channelId));
  if (guildId) conds.push(eq(pgVoiceRecordingsTable.guild_id, guildId));
  const rows = await db
    .select({
      id: pgVoiceRecordingsTable.id,
      username: pgVoiceRecordingsTable.username,
      channel_name: pgVoiceRecordingsTable.channel_name,
      filename: pgVoiceRecordingsTable.filename,
      size_bytes: pgVoiceRecordingsTable.size_bytes,
      upload_status: pgVoiceRecordingsTable.upload_status,
      transcription: pgVoiceRecordingsTable.transcription,
      created_at: pgVoiceRecordingsTable.created_at,
    })
    .from(pgVoiceRecordingsTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(pgVoiceRecordingsTable.created_at))
    .limit(limit);
  return JSON.stringify(rows);
}

async function moderationTimeline(
  guildId?: string,
  channelId?: string,
  days = 14,
): Promise<string> {
  const db = getDatabase();
  const day = sql<string>`to_char(to_timestamp(${pgMessagesTable.created_at} / 1000), 'YYYY-MM-DD')`;
  const rows = await db
    .select({
      day,
      total: sql<number>`COUNT(*)::int`,
      flagged: sql<number>`COUNT(*) FILTER (WHERE ${pgMessagesTable.ai_status} = 'flagged')::int`,
      warned: sql<number>`COUNT(*) FILTER (WHERE ${pgMessagesTable.ai_status} = 'warn')::int`,
      clean: sql<number>`COUNT(*) FILTER (WHERE ${pgMessagesTable.ai_status} = 'clean')::int`,
    })
    .from(pgMessagesTable)
    .where(
      and(
        scopeMessages(guildId, channelId),
        // only the last N days
        sql`${pgMessagesTable.created_at} >= extract(epoch FROM now() - (${days} || ' days')::interval) * 1000`,
      ),
    )
    .groupBy(day)
    .orderBy(day);
  return JSON.stringify(rows);
}

async function corrections(_guildId?: string, limit = 10): Promise<string> {
  const db = getDatabase();
  const rows = await db
    .select({
      id: pgCorrectedModerationsTable.id,
      message_id: pgCorrectedModerationsTable.message_id,
      original_flags: pgCorrectedModerationsTable.original_flags,
      corrected_flags: pgCorrectedModerationsTable.corrected_flags,
      correction_notes: pgCorrectedModerationsTable.correction_notes,
      content_snippet: pgCorrectedModerationsTable.content_snippet,
      created_at: pgCorrectedModerationsTable.created_at,
    })
    .from(pgCorrectedModerationsTable)
    .orderBy(desc(pgCorrectedModerationsTable.created_at))
    .limit(limit);
  return JSON.stringify(rows);
}
