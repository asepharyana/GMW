import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createChildLogger } from "@bete/shared/logger";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import { migrate as migratePostgres } from "drizzle-orm/node-postgres/migrator";
import type { PoolClient } from "pg";
import {
  closeDatabase,
  initializeDatabase,
  withDatabaseClient,
} from "./drizzle.js";
import * as schema from "./schema.js";

const logger = createChildLogger("migrate");
const MIGRATION_LOCK_KEY_1 = 2026;
const MIGRATION_LOCK_KEY_2 = 531;

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface MigrationJournal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

/**
 * Read the Drizzle migration journal and return the tag (hash) of the
 * first migration entry. This avoids hardcoding "0000_tricky_mysterio"
 * which would break if the initial migration is ever regenerated.
 */
async function getFirstMigrationTag(): Promise<string> {
  const journalPath = join(
    process.cwd(),
    "drizzle/migrations/meta/_journal.json",
  );
  const raw = await readFile(journalPath, "utf-8");
  const journal: MigrationJournal = JSON.parse(raw);

  if (!journal.entries || journal.entries.length === 0) {
    throw new Error(
      "Migration journal is empty — cannot determine first migration tag",
    );
  }

  // Entries are ordered by idx — the first entry is the initial migration.
  const first = journal.entries.reduce((earliest, entry) =>
    entry.idx < earliest.idx ? entry : earliest,
  );
  return first.tag;
}

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

  const firstMigrationTag = await getFirstMigrationTag();

  logger.info(
    { firstMigrationTag },
    "Seeding Drizzle migration history — marking first migration as already applied on this pre-existing database",
  );

  // Create the Drizzle tracking table and insert a row for the first migration.
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
    [firstMigrationTag],
  );
  if (alreadySeeded.rows.length === 0) {
    await client.query(
      `INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
      [firstMigrationTag, Date.now()],
    );
  }
  logger.info(
    { firstMigrationTag },
    "Drizzle history seeded — first migration marked applied",
  );
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

          // Monkey-patch client.query to intercept and ignore Drizzle's
          // hardcoded schema creation, which fails in PG15+ restricted public schemas.
          const originalQuery = client.query;
          client.query = (async (...args: any[]) => {
            const queryText = args[0];
            const text = typeof queryText === "string" ? queryText : queryText?.text;
            if (text && typeof text === "string" && text.includes('CREATE SCHEMA IF NOT EXISTS "public"')) {
              return { rows: [], command: "CREATE", rowCount: 0, oid: 0, fields: [] };
            }
            return Function.prototype.apply.call(originalQuery, client, args);
          }) as typeof client.query;

          try {
            await migratePostgres(db, {
              migrationsFolder: "./drizzle/migrations",
              migrationsSchema: "public",
            });
          } finally {
            client.query = originalQuery;
          }
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
