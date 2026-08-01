import { desc, eq } from "drizzle-orm";
import { createChildLogger } from "@/shared/logger/index";
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
    // Drizzle wraps PG errors — dig into cause + enumerable props for the real PG error
    const err = error as Error & Record<string, unknown>;
    const detail: Record<string, unknown> = {
      message: err.message,
      name: err.name,
    };
    // node-postgres native error props
    for (const k of [
      "code",
      "detail",
      "schema",
      "table",
      "constraint",
      "severity",
    ]) {
      if (err[k] !== undefined) detail[k] = err[k];
    }
    // drizzle may stash the original in .cause
    const cause = err.cause;
    if (cause instanceof Error) {
      const causeErr = cause as Error & Record<string, unknown>;
      detail.cause = {
        message: causeErr.message,
        name: causeErr.name,
        code: causeErr.code,
        detail: causeErr.detail,
        constraint: causeErr.constraint,
      };
    }
    logger.error(
      { id: recording.id, error: detail },
      "Failed to insert voice recording",
    );
    throw error;
  }
}

export async function updateVoiceRecordingAsUploaded(
  id: string,
  downloadUrl: string,
  uploadedAt: number,
  filename?: string,
  sizeBytes?: number,
): Promise<void> {
  try {
    await db()
      .update(voiceRecordingsTable)
      .set({
        download_url: downloadUrl,
        upload_status: "uploaded",
        uploaded_at: uploadedAt,
        ...(filename !== undefined ? { filename } : {}),
        ...(sizeBytes !== undefined ? { size_bytes: sizeBytes } : {}),
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

export async function updateVoiceRecordingTranscription(
  id: string,
  transcription: string,
): Promise<void> {
  try {
    await db()
      .update(voiceRecordingsTable)
      .set({ transcription })
      .where(eq(voiceRecordingsTable.id, id));
  } catch (error) {
    logger.error(
      { id, error: error instanceof Error ? error.message : String(error) },
      "Failed to update voice recording transcription",
    );
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
