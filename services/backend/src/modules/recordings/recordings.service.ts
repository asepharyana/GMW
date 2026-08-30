import {
  and,
  desc,
  eq,
  gte,
  ilike,
  lt,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { getDatabase } from "../../shared/database/index.js";
import { pgVoiceRecordingsTable } from "../../shared/index.js";
import { createChildLogger } from "../../shared/logger/index.js";

const logger = createChildLogger("recordings.service");

export interface RecordingRow {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  guild_id: string | null;
  channel_id: string | null;
  channel_name: string | null;
  filename: string;
  size_bytes: number;
  download_url: string | null;
  upload_status: string;
  upload_error: string | null;
  created_at: number;
  uploaded_at: number | null;
  transcription: string | null;
}

export interface PaginatedRecordings {
  items: RecordingRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface RecordingFilters {
  channelId?: string;
  userId?: string;
  cursor?: string;
  /** keyword search against transcription + username (ILIKE) */
  q?: string;
  /** created_at lower bound (epoch ms) */
  startDate?: number;
  /** created_at upper bound (epoch ms) */
  endDate?: number;
}

export interface SpeakerSummary {
  user_id: string;
  username: string;
  avatar_url: string | null;
  clips: number;
  /** summed MP3 bytes; ~128kbps → est duration in seconds */
  est_duration_s: number;
  words: number;
  transcribed: number;
  last_at: number;
}

export class RecordingsService {
  async getRecent(
    limit = 50,
    filters: RecordingFilters = {},
  ): Promise<PaginatedRecordings> {
    logger.info({ limit, filters }, "getRecent called");
    const db = getDatabase();

    const conditions: SQL[] = [];

    if (filters.cursor) {
      conditions.push(
        lt(pgVoiceRecordingsTable.created_at, Number(filters.cursor)),
      );
    }
    if (filters.channelId) {
      conditions.push(eq(pgVoiceRecordingsTable.channel_id, filters.channelId));
    }
    if (filters.userId) {
      conditions.push(eq(pgVoiceRecordingsTable.user_id, filters.userId));
    }
    if (filters.q) {
      const like = `%${filters.q}%`;
      const qOr = or(
        ilike(pgVoiceRecordingsTable.transcription, like),
        ilike(pgVoiceRecordingsTable.username, like),
      );
      if (qOr) conditions.push(qOr);
    }
    if (filters.startDate) {
      conditions.push(
        gte(pgVoiceRecordingsTable.created_at, filters.startDate),
      );
    }
    if (filters.endDate) {
      conditions.push(lte(pgVoiceRecordingsTable.created_at, filters.endDate));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const allRows = await db
      .select({
        id: pgVoiceRecordingsTable.id,
        user_id: pgVoiceRecordingsTable.user_id,
        username: pgVoiceRecordingsTable.username,
        avatar_url: pgVoiceRecordingsTable.avatar_url,
        guild_id: pgVoiceRecordingsTable.guild_id,
        channel_id: pgVoiceRecordingsTable.channel_id,
        channel_name: pgVoiceRecordingsTable.channel_name,
        filename: pgVoiceRecordingsTable.filename,
        size_bytes: pgVoiceRecordingsTable.size_bytes,
        download_url: pgVoiceRecordingsTable.download_url,
        upload_status: pgVoiceRecordingsTable.upload_status,
        upload_error: pgVoiceRecordingsTable.upload_error,
        created_at: pgVoiceRecordingsTable.created_at,
        uploaded_at: pgVoiceRecordingsTable.uploaded_at,
        transcription: pgVoiceRecordingsTable.transcription,
      })
      .from(pgVoiceRecordingsTable)
      .where(where)
      .orderBy(desc(pgVoiceRecordingsTable.created_at))
      .limit(limit + 1);

    const items = allRows.slice(0, limit) as unknown as RecordingRow[];
    const hasMore = allRows.length > limit;
    const nextCursor = hasMore
      ? String(items[items.length - 1]?.created_at)
      : null;

    return { items, nextCursor, hasMore };
  }

  async deleteById(id: string): Promise<void> {
    const db = getDatabase();
    await db
      .delete(pgVoiceRecordingsTable)
      .where(eq(pgVoiceRecordingsTable.id, id));
  }

  /**
   * Speaker leaderboard: aggregate clips / est. duration / transcribed words
   * per user. `est_duration_s` derives from summed MP3 bytes at the uploader's
   * 128 kbps transcode rate; `words` sums transcription word counts.
   */
  async getSummary(): Promise<SpeakerSummary[]> {
    const db = getDatabase();
    const t = pgVoiceRecordingsTable;

    const rows = await db
      .select({
        user_id: t.user_id,
        username: t.username,
        avatar_url: t.avatar_url,
        clips: sql<number>`count(*)::int`,
        total_bytes: sql<number>`coalesce(sum(${t.size_bytes}), 0)`,
        words: sql<number>`coalesce(sum(array_length(string_to_array(${t.transcription}, ' '), 1)), 0)::int`,
        transcribed: sql<number>`count(${t.transcription})::int`,
        last_at: sql<number>`max(${t.created_at})`,
      })
      .from(t)
      .groupBy(t.user_id, t.username, t.avatar_url)
      .orderBy(sql`clips desc, last_at desc`);

    return rows.map((r) => ({
      user_id: r.user_id,
      username: r.username,
      avatar_url: r.avatar_url,
      clips: r.clips,
      // 128 kbps = 128000 bps → bytes*8/128000 = seconds
      est_duration_s: Math.round((r.total_bytes * 8) / 128000),
      words: r.words,
      transcribed: r.transcribed,
      last_at: r.last_at,
    }));
  }
}

export const recordingsService = new RecordingsService();
