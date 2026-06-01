import "dotenv/config";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import { migrate as migratePostgres } from "drizzle-orm/node-postgres/migrator";
import { config } from "../../shared/config/config.js";
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
