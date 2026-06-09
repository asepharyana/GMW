import path from "node:path";
import Database from "better-sqlite3";
import { createChildLogger } from "@bete/shared/logger";
import { getPool, closeDatabase, initializeDatabase } from "../services/backend/src/shared/database/index.js";

const logger = createChildLogger("migrate-data");

interface MuxerJob {
  id: string;
  data: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  updatedAt: number;
  error?: string;
}

interface Message {
  id: string;
  guild_id: string;
  channel_id: string;
  thread_id?: string;
  user_id: string;
  username: string;
  avatar_url?: string;
  content: string;
  edited_content?: string;
  created_at: number;
  edited_at?: number;
  deleted_at?: number;
  type: string;
  metadata?: string;
  ai_status: string;
  ai_moderation_flags?: string;
  ai_moderation_score?: number;
  ai_moderation_raw?: string;
  ai_analysis?: string;
  ai_analyzed_at?: number;
  ai_error?: string;
}

interface Attachment {
  id: string;
  message_id: string;
  guild_id: string;
  channel_id: string;
  thread_id?: string;
  user_id: string;
  filename: string;
  size: number;
  type: string;
  discord_url: string;
  uploaded_url?: string;
  upload_status: string;
  upload_error?: string;
  created_at: number;
  uploaded_at?: number;
}

interface UiState {
  key: string;
  value: string;
  updated_at: number;
}

async function migrateData(): Promise<void> {
  let sqliteDb: Database.Database | null = null;

  try {
    logger.info("Starting data migration from SQLite to PostgreSQL");

    // Open SQLite database
    const dbPath = path.join(process.cwd(), ".muxer-queue.db");
    sqliteDb = new Database(dbPath);
    logger.info({ dbPath }, "SQLite database opened");

    // Initialize PostgreSQL pool
    await initializeDatabase();
    const pool = getPool();
    logger.info("PostgreSQL connection pool initialized");

    // Migrate muxer_jobs table
    logger.info("Migrating muxer_jobs table...");
    const muxerJobsStmt = sqliteDb.prepare("SELECT * FROM muxer_jobs");
    const muxerJobs = muxerJobsStmt.all() as MuxerJob[];

    for (const job of muxerJobs) {
      await pool.query(
        `INSERT INTO muxer_jobs (id, data, status, attempts, maxAttempts, createdAt, updatedAt, error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [
          job.id,
          job.data,
          job.status,
          job.attempts,
          job.maxAttempts,
          job.createdAt,
          job.updatedAt,
          job.error || null,
        ],
      );
    }
    logger.info({ count: muxerJobs.length }, "Migrated muxer_jobs");

    // Migrate messages table
    logger.info("Migrating messages table...");
    const messagesStmt = sqliteDb.prepare("SELECT * FROM messages");
    const messages = messagesStmt.all() as Message[];

    for (const msg of messages) {
      await pool.query(
        `INSERT INTO messages (
          id, guild_id, channel_id, thread_id, user_id, username, avatar_url,
          content, edited_content, created_at, edited_at, deleted_at, type,
          metadata, ai_status, ai_moderation_flags, ai_moderation_score,
          ai_moderation_raw, ai_analysis, ai_analyzed_at, ai_error
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21
        )
        ON CONFLICT (id) DO NOTHING`,
        [
          msg.id,
          msg.guild_id,
          msg.channel_id,
          msg.thread_id || null,
          msg.user_id,
          msg.username,
          msg.avatar_url || null,
          msg.content,
          msg.edited_content || null,
          msg.created_at,
          msg.edited_at || null,
          msg.deleted_at || null,
          msg.type,
          msg.metadata || null,
          msg.ai_status,
          msg.ai_moderation_flags || null,
          msg.ai_moderation_score || null,
          msg.ai_moderation_raw || null,
          msg.ai_analysis || null,
          msg.ai_analyzed_at || null,
          msg.ai_error || null,
        ],
      );
    }
    logger.info({ count: messages.length }, "Migrated messages");

    // Migrate attachments table
    logger.info("Migrating attachments table...");
    const attachmentsStmt = sqliteDb.prepare("SELECT * FROM attachments");
    const attachments = attachmentsStmt.all() as Attachment[];

    for (const att of attachments) {
      await pool.query(
        `INSERT INTO attachments (
          id, message_id, guild_id, channel_id, thread_id, user_id, filename,
          size, type, discord_url, uploaded_url, upload_status, upload_error,
          created_at, uploaded_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
        )
        ON CONFLICT (id) DO NOTHING`,
        [
          att.id,
          att.message_id,
          att.guild_id,
          att.channel_id,
          att.thread_id || null,
          att.user_id,
          att.filename,
          att.size,
          att.type,
          att.discord_url,
          att.uploaded_url || null,
          att.upload_status,
          att.upload_error || null,
          att.created_at,
          att.uploaded_at || null,
        ],
      );
    }
    logger.info({ count: attachments.length }, "Migrated attachments");

    // Migrate ui_state table
    logger.info("Migrating ui_state table...");
    const uiStateStmt = sqliteDb.prepare("SELECT * FROM ui_state");
    const uiStates = uiStateStmt.all() as UiState[];

    for (const state of uiStates) {
      await pool.query(
        `INSERT INTO ui_state (key, value, updated_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [state.key, state.value, state.updated_at],
      );
    }
    logger.info({ count: uiStates.length }, "Migrated ui_state");

    logger.info(
      {
        muxerJobs: muxerJobs.length,
        messages: messages.length,
        attachments: attachments.length,
        uiState: uiStates.length,
      },
      "Data migration completed successfully",
    );
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Data migration failed",
    );
    process.exit(1);
  } finally {
    // Close SQLite connection
    if (sqliteDb) {
      sqliteDb.close();
      logger.info("SQLite database closed");
    }

    // Close PostgreSQL pool
    await closeDatabase();
    logger.info("PostgreSQL connection pool closed");
  }
}

// Run migration
migrateData().catch((error) => {
  logger.error(
    {
      error: error instanceof Error ? error.message : String(error),
    },
    "Unhandled error in migration",
  );
  process.exit(1);
});
