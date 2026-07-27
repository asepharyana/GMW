import { pgVoiceRecordingsTable } from "@bete/shared";
import { createChildLogger } from "@bete/shared/logger";
import { and, desc, eq, lt, type SQL } from "drizzle-orm";
import { getDatabase } from "../../shared/database/index.js";

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
  duration_bytes: number;
}

export interface PaginatedRecordings {
  items: RecordingRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

export class RecordingsService {
  async getRecent(
    limit = 50,
    filters?: { channelId?: string; userId?: string; cursor?: string },
  ): Promise<PaginatedRecordings> {
    logger.info({ limit }, "getRecent called");
    const db = getDatabase();

    const conditions: SQL[] = [];

    if (filters?.cursor) {
      conditions.push(
        lt(pgVoiceRecordingsTable.created_at, Number(filters.cursor)),
      );
    }
    if (filters?.channelId) {
      conditions.push(eq(pgVoiceRecordingsTable.channel_id, filters.channelId));
    }
    if (filters?.userId) {
      conditions.push(eq(pgVoiceRecordingsTable.user_id, filters.userId));
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
        duration_bytes: pgVoiceRecordingsTable.size_bytes,
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
}

export const recordingsService = new RecordingsService();
