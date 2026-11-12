import { randomBytes } from "node:crypto"
import pg from "pg"

/**
 * Per-file Postgres schema isolation.
 *
 * WHY THIS EXISTS: eleven files in this directory TRUNCATE the same tables in
 * `beforeAll`/`beforeEach`. Under bun they ran sequentially, so they were safe by
 * accident of the runner. Vitest parallelises by default, and the files then
 * wipe each other's rows mid-run — `worker.test.ts` passes 31/31 alone and fails
 * in the full suite for exactly that reason. The fix chosen at the time was
 * `fileParallelism: false` in vitest.config.ts, which serialises the whole suite
 * and hides the coupling rather than removing it.
 *
 * WHAT IT DOES: every file gets its own schema, named from the file plus a
 * random suffix, with `search_path` pinned to it on the pool. A `TRUNCATE
 * messages` inside that file can only see that file's tables. Two files may then
 * run concurrently without observing each other.
 *
 * WHY A SCHEMA AND NOT A TRANSACTION: the tests need real commits and a real
 * worker loop across many round trips; a rolled-back transaction would hide all
 * of it. Schemas are also cheap — CREATE SCHEMA is a catalogue entry, no table
 * copying.
 *
 * WHY `CREATE TABLE ... LIKE public.<t>`: the production schema, including its
 * CHECK constraints and its functions, lives in `public`. Each file gets
 * structurally identical tables without duplicating the DDL, so a schema change
 * in migrations/ does not silently desynchronise the tests.
 *
 * NOT USED BY ANY FILE YET: this helper is the mechanism. Adopting it across the
 * eleven files is a separate, per-file change, verified one file at a time. Each
 * adoption is behaviour-preserving — the schema name and the unqualified table
 * names in the SQL stay exactly as they are.
 */

const DB_URL =
	process.env.TEST_DATABASE_URL ??
	"postgres://postgres:postgres@127.0.0.1:5433/gmw_mod"

/**
 * The tables the gateway tests actually read or write in SQL.
 *
 * Derived from the tests, not guessed: every `TRUNCATE` target across the
 * directory, plus every table named in a `FROM`/`INTO`/`UPDATE`. That is these
 * four, and the TRUNCATE lists in the files agree —
 *
 *   TRUNCATE messages, verdicts, analysis_attempts, attachments
 *
 * An earlier version of this list carried ten names, six of them copied from a
 * COMMENT in skipped-channel.test.ts that enumerates the migration's tables
 * rather than anything the tests touch. Two of those six do not even exist: the
 * table is `message_reactions`, not `reactions`. Under GMW_REQUIRE_TEST_DB=1
 * that turned a working suite into 10 failing files with
 * `relation "public.reactions" does not exist` — the strict mode working
 * correctly on a list that was wrong.
 *
 * Adding a table here is only necessary when a test starts USING it. A name
 * that does not exist in `public` fails the whole file, deliberately: a typo in
 * this list must not look like a passing suite.
 */
const MIRRORED_TABLES = [
	"messages",
	"verdicts",
	"analysis_attempts",
	"attachments",
	"media_vision_cache",
] as const

export interface IsolatedPool {
	pool: pg.Pool
	/** Safe to call more than once; each call after the first is a no-op. */
	cleanup: () => Promise<void>
}

/**
 * Create a pool pinned to a fresh schema containing copies of the production
 * tables.
 *
 * Throws when the database is unreachable or when the `search_path` pin fails to
 * take — a pool that silently fell back to `public` would reintroduce exactly
 * the cross-file truncation this exists to prevent. Use
 * `tryCreateIsolatedPool` for files that have always degraded to a no-op.
 */
export async function createIsolatedPool(
	fileLabel: string,
	options: { max?: number } = {},
): Promise<IsolatedPool> {
	const schema = `t_${fileLabel}_${randomBytes(4).toString("hex")}`
	const admin = new pg.Pool({ connectionString: DB_URL, max: 1 })
	let pool: pg.Pool | undefined
	let dropped = false

	try {
		await admin.query(`CREATE SCHEMA "${schema}"`)

		// Structure only, no rows. IF NOT EXISTS so a retry after a partial failure
		// does not hard-error on the tables that did land.
		for (const table of MIRRORED_TABLES) {
			await admin.query(
				`CREATE TABLE IF NOT EXISTS "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`,
			)
		}

		pool = new pg.Pool({
			connectionString: DB_URL,
			max: options.max ?? 4,
			// Pin search_path ON THE POOL, so every connection it hands out resolves
			// unqualified names into the schema. That is what makes it survive pool
			// growth; a per-connection SET would apply to one session only.
			options: `-c search_path=${schema},public`,
		})

		// Verify the pin took rather than trusting it.
		//
		// The column is named `search_path`, not `sp`. An earlier version read
		// `rows[0].sp`, which is undefined, so this check compared
		// `undefined?.includes(schema)` -> undefined -> falsy and threw EVERY time.
		// Permissive mode swallowed that into a silent skip, which is how a suite
		// with zero isolation still reported green. Only GMW_REQUIRE_TEST_DB=1
		// surfaced it. Read the real column, and assert the shape rather than
		// probing for a name that may not exist.
		const { rows } =
			await pool.query<Record<string, string>>("SHOW search_path")
		const actual = rows[0]?.search_path
		if (typeof actual !== "string" || !actual.includes(schema)) {
			throw new Error(
				`search_path not pinned to ${schema} (got: ${actual ?? "no rows"})`,
			)
		}

		return {
			pool,
			cleanup: async () => {
				await pool?.end()
				if (dropped) return
				dropped = true
				await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
				await admin.end()
			},
		}
	} catch (error) {
		await pool?.end().catch(() => undefined)
		await admin
			.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
			.catch(() => undefined)
		await admin.end().catch(() => undefined)
		throw error
	}
}

/**
 * The variant for files that have always degraded to a no-op when the database
 * is unreachable. Returns null instead of throwing.
 *
 * IT WARNS BEFORE DOING SO. A silent skip is indistinguishable from a pass: if
 * the tables this file mirrors are missing, every one of its assertions quietly
 * stops running and the suite stays green while testing nothing. That is not
 * hypothetical — CI provisions a stock `postgres:18` with no schema applied, so
 * `CREATE TABLE ... LIKE public.<table>` fails there until a migration step is
 * added to the workflow. Measured against an empty database: 21 files skip, and
 * the suite reports success.
 *
 * So this ALSO FAILS THE RUN when it is skipped in CI, where a database is
 * supposed to be available. A skip is legitimate on a laptop with no Postgres;
 * it is a misconfigured pipeline everywhere else. Set
 * `GMW_REQUIRE_TEST_DB=1` (the CI workflow does) to turn the warning into a
 * thrown error, which fails the suite loudly instead of reporting a green run
 * that tested nothing.
 */
export async function tryCreateIsolatedPool(
	fileLabel: string,
	options: { max?: number } = {},
): Promise<IsolatedPool | null> {
	try {
		return await createIsolatedPool(fileLabel, options)
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error)
		const message =
			`[isolated-pool] ${fileLabel}: SKIPPED — ${reason}\n` +
			`  Its assertions did NOT run. Either no database is reachable, or the\n` +
			`  schema in \`public\` is missing the tables this file mirrors.`

		if (process.env.GMW_REQUIRE_TEST_DB === "1") {
			throw new Error(
				`${message}\n` +
					`  GMW_REQUIRE_TEST_DB=1 is set, so a skipped DB-backed file is a\n` +
					`  failure. Apply the schema to the test database before the test step.`,
			)
		}

		console.warn(message)
		return null
	}
}

/** The URL these tests connect to, for diagnostics. */
export const integrationDatabaseUrl = DB_URL
