import "dotenv/config"
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres"
import { migrate as migratePostgres } from "drizzle-orm/node-postgres/migrator"
import { createChildLogger } from "../logger/index.js"
import { initializeDatabase, withDatabaseClient } from "./drizzle.js"
import * as schema from "./schema.js"

const logger = createChildLogger("migrate")

// Advisory-lock pair that serialises migration runs. Boot invokes runMigrations()
// from BOTH the Discord capture path (gateway/bootstrap.ts) and the moderation
// worker (worker/start.ts) — now in one process, but still two concurrent
// callers — and Drizzle's migrator is not safe against itself. Without this,
// two workers can try to CREATE the same table at the same time.
const MIGRATION_LOCK_KEY_1 = 2026
const MIGRATION_LOCK_KEY_2 = 531

/**
 * Apply the Drizzle migrations.
 *
 * This used to be 441 lines. The extra bulk was a reconciliation layer that
 * decided what to do about PRE-EXISTING databases — it inspected the live
 * schema against a hand-maintained sentinel list, seeded `-reconciled` markers
 * into `__drizzle_migrations`, and rolled stale markers back.
 *
 * All of that existed to answer one question: "which of the 28 incremental
 * migrations has this legacy database already had applied?" That question is
 * gone. `drizzle/migrations/0000_baseline.sql` is the whole schema, so a
 * database is either fully migrated (one row in the ledger) or untouched (no
 * rows), and Drizzle's own "apply everything newer than MAX(created_at)" rule
 * handles both without help.
 *
 * Deleting the reconciler is not only a simplification. Its own comments record
 * that it twice marked a migration applied WITHOUT running it, leaving
 * production healthy against a schema with no `verdicts` table. That class of
 * bug cannot exist when there is a single migration to be wrong about.
 *
 * Consequence to be aware of: a database built by the OLD migration chain cannot
 * be migrated onto — it has to be rebuilt once. `scripts/reset-data.sh` does
 * that, and it is a manual operation: deploys never touch data.
 *
 * IMPORTANT — this leaves the pool OPEN.
 *
 *   It used to close the pool in a `finally`, on the assumption that migration
 *   was a standalone CLI concern. That assumption stopped being true when
 *   Discord capture and the moderation worker moved into this same process:
 *   both run after migrations, both use this pool, and `closeDatabase()` nulls
 *   the module singleton as well as ending the pool. So every later `getPool()`
 *   threw "Database not initialized. Call initializeDatabase() first." —
 *   production lost message capture, the moderation worker, the verdict notifier
 *   and the auto-delete enforcer, while the dashboard stayed green because it
 *   reads through Prisma. Captured in prod logs at deploy a6105760.
 *
 *   Lifecycle is now the caller's: whoever opens the pool closes it, which is
 *   what shutdown() in index.ts already does via closeDrizzleDatabase().
 */
export async function runMigrations(): Promise<void> {
	try {
		logger.info("Starting PostgreSQL migrations")
		await initializeDatabase()

		await withDatabaseClient(async (client) => {
			const db = drizzlePostgres(client, { schema })

			await client.query("SELECT pg_advisory_lock($1, $2)", [
				MIGRATION_LOCK_KEY_1,
				MIGRATION_LOCK_KEY_2,
			])

			try {
				// Monkey-patch client.query to intercept and ignore Drizzle's
				// hardcoded schema creation, which fails in PG15+ restricted public schemas.
				const originalQuery = client.query
				client.query = (async (...args: any[]) => {
					const queryText = args[0]
					const text =
						typeof queryText === "string" ? queryText : queryText?.text
					if (
						text &&
						typeof text === "string" &&
						text.includes('CREATE SCHEMA IF NOT EXISTS "public"')
					) {
						return {
							rows: [],
							command: "CREATE",
							rowCount: 0,
							oid: 0,
							fields: [],
						}
					}
					return Function.prototype.apply.call(originalQuery, client, args)
				}) as typeof client.query

				try {
					await migratePostgres(db, {
						migrationsFolder: "./drizzle/migrations",
						migrationsSchema: "public",
					})

					// Ensure newly added non-breaking tables exist on databases that
					// already ran 0000_baseline.
					await client.query(`
						CREATE TABLE IF NOT EXISTS public.media_vision_cache (
							fingerprint text NOT NULL,
							description text NOT NULL,
							resolved_at bigint NOT NULL,
							hit_count integer DEFAULT 0 NOT NULL,
							CONSTRAINT media_vision_cache_pkey PRIMARY KEY (fingerprint)
						);
						CREATE INDEX IF NOT EXISTS idx_media_vision_cache_resolved_at
						ON public.media_vision_cache USING btree (resolved_at);
					`)
				} finally {
					client.query = originalQuery
				}
			} finally {
				await client.query("SELECT pg_advisory_unlock($1, $2)", [
					MIGRATION_LOCK_KEY_1,
					MIGRATION_LOCK_KEY_2,
				])
			}
		})

		logger.info("PostgreSQL migrations completed successfully")
	} catch (error) {
		logger.error(
			{ error: error instanceof Error ? error.message : String(error) },
			"Migration failed",
		)
		throw error
	}
}
