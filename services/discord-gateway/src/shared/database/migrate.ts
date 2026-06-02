import "dotenv/config";
import type { PoolClient } from "pg";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import { migrate as migratePostgres } from "drizzle-orm/node-postgres/migrator";
import { createChildLogger } from "@bete/shared/logger";
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
 * Seed Drizzle's __drizzle_migrations tracking table for pre-existing databases
 * that were created manually or by an earlier migration system (e.g., the old
 * checkSchemaExists short-circuit). Without this, Drizzle attempts to re-create
 * all tables from 0000 and fails with "relation already exists".
 */
async function seedDrizzleHistory(client: PoolClient): Promise<void> {
  const exists = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_name = '__drizzle_migrations'
    )
  `);
  const drizzleTableExists = exists.rows[0]?.exists === true;
  if (drizzleTableExists) {
    return; // already seeded, nothing to do
  }

  // Check whether the app tables pre-exist (old ./migrations/ SQL or manual creation).
  const hasTextCache = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_name = 'text_analysis_cache' AND column_name = 'text'
    )
  `);
  if (hasTextCache.rows[0]?.exists !== true) {
    return; // brand-new database, let Drizzle handle everything
  }

  logger.info(
    "Seeding Drizzle migration history — marking 0000 as already applied on this pre-existing database",
  );

  // Create the Drizzle tracking table and insert a row for migration 0000.
  await client.query(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);
  // Drizzle's __drizzle_migrations table has no UNIQUE(hash)
  // constraint, so check manually before inserting.
  const alreadySeeded = await client.query(
    `SELECT 1 FROM "__drizzle_migrations" WHERE hash = $1 LIMIT 1`,
    ["0000_tricky_mysterio"],
  );
  if (alreadySeeded.rows.length === 0) {
    await client.query(
      `INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
      ["0000_tricky_mysterio", Date.now()],
    );
  }
  logger.info("Drizzle history seeded — 0000 marked applied");
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
          // Seed history for pre-existing databases so Drizzle only applies
          // new (pending) migrations — it is idempotent after that.
          await seedDrizzleHistory(client);

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
