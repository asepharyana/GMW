import "dotenv/config";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import { migrate as migratePostgres } from "drizzle-orm/node-postgres/migrator";
import type { PoolClient } from "pg";
import { createChildLogger } from "../../shared/logger/logger.js";
import {
  closeDatabase,
  initializeDatabase,
  withDatabaseClient,
} from "./drizzle.js";
import * as schema from "./schema.js";

const logger = createChildLogger("migrate");
const MIGRATION_LOCK_KEY_1 = 2026;
const MIGRATION_LOCK_KEY_2 = 531;

/**
 * Check if all schema tables already exist in the database.
 * If they do, the database was likely created by a previous deployment
 * and migration is not needed.
 */
async function checkSchemaExists(client: PoolClient): Promise<boolean> {
  try {
    const result = await client.query(`
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'ai_analysis_runs', 'attachments', 'message_reviews',
          'messages', 'moderation_actions', 'muxer_jobs',
          'retention_policies', 'text_analysis_cache', 'ui_state',
          'voice_recordings'
        )
    `);
    return result.rows[0]?.count === "10";
  } catch {
    return false;
  }
}

export async function runMigrations(): Promise<void> {
  try {
    logger.info("Starting PostgreSQL migrations");
    await initializeDatabase();

    try {
      await withDatabaseClient(async (client) => {
        const db = drizzlePostgres(client, { schema });

        await client.query("SELECT pg_advisory_lock($1, $2)", [
          MIGRATION_LOCK_KEY_1,
          MIGRATION_LOCK_KEY_2,
        ]);

        try {
          // If all schema tables already exist, skip migration
          const schemaExists = await checkSchemaExists(client);
          if (schemaExists) {
            logger.info("Schema tables already exist; skipping migration");
            return;
          }

          await migratePostgres(db, {
            migrationsFolder: "./drizzle/migrations",
          });
        } finally {
          await client.query("SELECT pg_advisory_unlock($1, $2)", [
            MIGRATION_LOCK_KEY_1,
            MIGRATION_LOCK_KEY_2,
          ]);
        }
      });
    } finally {
      await closeDatabase();
    }

    logger.info("PostgreSQL migrations completed successfully");
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Migration failed",
    );
    throw error;
  }
}
