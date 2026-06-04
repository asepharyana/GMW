import { createChildLogger } from "@bete/shared/logger";
import { desc, eq } from "drizzle-orm";
import { getDatabase } from "./drizzle.js";
import {
  type VoiceRecording,
  type VoiceRecordingInsert,
  voiceRecordingsTable,
} from "./schema.js";

const logger = createChildLogger("voice-recording-repo");

interface QueryBuilder<T = unknown> extends PromiseLike<T> {
  from(...args: unknown[]): QueryBuilder<T>;
  where(...args: unknown[]): QueryBuilder<T>;
  orderBy(...args: unknown[]): QueryBuilder<T>;
  limit(...args: unknown[]): QueryBuilder<T>;
  offset(...args: unknown[]): QueryBuilder<T>;
  values(...args: unknown[]): QueryBuilder<T>;
  onConflictDoNothing(...args: unknown[]): QueryBuilder<T>;
  returning(...args: unknown[]): QueryBuilder<T>;
  set(...args: unknown[]): QueryBuilder<T>;
}

interface RecordingDatabase {
  select<T = unknown[]>(...args: unknown[]): QueryBuilder<T>;
  insert<T = unknown>(...args: unknown[]): QueryBuilder<T>;
  update(...args: unknown[]): QueryBuilder<unknown>;
}

function db(): RecordingDatabase {
  return getDatabase() as unknown as RecordingDatabase;
}

export async function insertVoiceRecording(
  recording: VoiceRecordingInsert,
): Promise<void> {
  try {
    await db()
      .insert(voiceRecordingsTable)
      .values(recording)
      .onConflictDoNothing();
  } catch (error) {
    logger.error(
      {
        id: recording.id,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to insert voice recording",
    );
    throw error;
  }
}

export async function updateVoiceRecordingAsUploaded(
  id: string,
  downloadUrl: string,
  uploadedAt: number,
): Promise<void> {
  try {
    await db()
      .update(voiceRecordingsTable)
      .set({
        download_url: downloadUrl,
        upload_status: "uploaded",
        uploaded_at: uploadedAt,
      })
      .where(eq(voiceRecordingsTable.id, id));
  } catch (error) {
    logger.error(
      { id, error: error instanceof Error ? error.message : String(error) },
      "Failed to update voice recording status to uploaded",
    );
    throw error;
  }
}

export async function updateVoiceRecordingAsFailed(
  id: string,
  error: string,
): Promise<void> {
  try {
    await db()
      .update(voiceRecordingsTable)
      .set({
        upload_status: "failed",
        upload_error: error,
      })
      .where(eq(voiceRecordingsTable.id, id));
  } catch (error) {
    logger.error(
      { id, error: error instanceof Error ? error.message : String(error) },
      "Failed to update voice recording status to failed",
    );
    throw error;
  }
}

export async function listVoiceRecordings(
  limit = 100,
): Promise<VoiceRecording[]> {
  try {
    const rows = await db()
      .select()
      .from(voiceRecordingsTable)
      .orderBy(desc(voiceRecordingsTable.created_at))
      .limit(limit);
    return rows as VoiceRecording[];
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to list voice recordings",
    );
    throw error;
  }
}
