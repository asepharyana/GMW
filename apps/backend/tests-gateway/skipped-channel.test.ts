/**
 * A channel on the skip list must never be analysed — and must stop being
 * re-offered, not be re-claimed forever.
 *
 * WHY A TERMINAL STATE WAS NEEDED
 *
 * Until now a skip could only be expressed as "release the claim and put the
 * row back", which is what the NSFW path does: `ai_status = 'pending'` with a
 * 5-minute backoff. That is not a skip, it is a poll — the row is re-claimed
 * 12x an hour for the lifetime of the message, `attempts` climbs without
 * bound, the backlog gauge never drains, and if the condition is later removed
 * the row arrives already carrying a nonsense attempt count.
 *
 * There was no way to say "we are never going to analyse this", because the
 * state machine had no terminal state for it. `MessageState` even declared
 * `| "skipped"` in worker.ts while nothing ever wrote it, and
 * `claim_messages()` carried an unused `p_excluded_channel_ids` parameter for
 * the same idea. So a channel that is deliberately exempt (a bot-dedicated
 * channel) had to either poll forever or be dropped at capture time — and
 * capture is the dashboard, so dropping it there hides the channel entirely.
 *
 * `skipped` is that terminal state: no verdict (there is no judgement to make),
 * no retry budget consumed, and never re-claimed.
 *
 * Run: bun test tests/
 */

import type pg from "pg"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest"
import type {
	LlmGateway,
	LlmRequest,
} from "../src/infrastructure/modules-gateway/ai-moderation/llmGateway.js"
import { ModerationWorker } from "../src/infrastructure/modules-gateway/ai-moderation/worker.js"

import { type IsolatedPool, tryCreateIsolatedPool } from "./isolated-pool.js"

/** The bot-dedicated channel this feature exists for. */
const SKIP_CHANNEL = "1308392257975488593"
/** A single thread inside an otherwise fully moderated channel. */
const SKIP_THREAD = "1305418007345893480"
const NORMAL_CHANNEL = "chan-normal"

let pool: pg.Pool
let reachable = false
/**
 * Drops this file's isolated schema. Null when the database was unreachable, in
 * which case there is nothing to clean up.
 */
let isolation: IsolatedPool | null = null

async function seed(
	rows: { id: string; channel: string; user?: string; thread?: string }[],
): Promise<void> {
	await pool.query(
		"TRUNCATE messages, verdicts, analysis_attempts, attachments",
	)
	for (const r of rows) {
		await pool.query(
			`INSERT INTO messages
         (id, guild_id, channel_id, thread_id, user_id, username, content,
          created_at, ai_status, ready_for_work_at, metadata)
       VALUES ($1, 'g1', $2, $3, $4, 'user', $5, 1, 'pending', 0, NULL)`,
			[r.id, r.channel, r.thread ?? null, r.user ?? "u1", `body ${r.id}`],
		)
	}
}

function scriptedGateway(
	respond: (req: LlmRequest, call: number) => string,
): LlmGateway & { calls: number; seenIds: string[] } {
	const g = {
		modelLabel: "scripted",
		calls: 0,
		seenIds: [] as string[],
		async complete(req: LlmRequest): Promise<string> {
			g.calls += 1
			const ids = [...req.user.matchAll(/<message id="([^"]+)"/g)].map(
				(m) => m[1],
			)
			g.seenIds.push(...ids)
			return respond(req, g.calls)
		},
	}
	return g
}

/**
 * A deletion for the given ids.
 *
 * `reason` is required whenever `status` is `deleted` — `verdicts_reason_check`
 * rejects the row otherwise — and the removed `severity`/`recommended_action`
 * fields are gone: `status` is the whole decision.
 */
const verdictFor = (ids: string[]) =>
	JSON.stringify({
		results: ids.map((id) => ({
			message_id: id,
			status: "deleted",
			reason: "test verdict",
			flags: ["abuse"],
			categories: ["abuse"],
			confidence: 0.95,
			score: 0.9,
			analysis: "test verdict",
			evidence: [],
			policy_version: "test",
		})),
	})

/** Small, self-consistent budget — the lease must exceed vision + moderation. */
const TEST_WORKER_CONFIG = {
	claimBatchSize: 10,
	leaseMs: 60_000,
	llmTimeoutMs: 10_000,
	visionTimeoutMs: 10_000,
	idlePollMs: 10,
	skipChannelIds: [SKIP_CHANNEL],
	skipThreadIds: [SKIP_THREAD],
} as const

beforeAll(async () => {
	// Own schema, so this file's TRUNCATEs cannot reach another file's rows.
	// See ./isolated-pool.ts for why the suite is serialised without this.
	isolation = await tryCreateIsolatedPool("skipped_channel", { max: 2 })
	if (!isolation) {
		reachable = false
		return
	}
	pool = isolation.pool
	reachable = true
})

afterAll(async () => {
	await isolation?.cleanup()
})

describe("a skipped channel is never analysed", () => {
	test("the database accepts a terminal 'skipped' state", async () => {
		if (!reachable) return
		// Guards the migration itself. Without 0023 this throws check_violation and
		// every skip path in the worker fails at runtime instead of at boot.
		await seed([{ id: "chk-1", channel: NORMAL_CHANNEL }])
		await pool.query(
			"UPDATE messages SET ai_status = 'skipped' WHERE id = 'chk-1'",
		)
		const { rows } = await pool.query<{ ai_status: string }>(
			"SELECT ai_status FROM messages WHERE id = 'chk-1'",
		)
		expect(rows[0].ai_status).toBe("skipped")

		// And the v1 vocabulary is still rejected, so the state stays disciplined.
		await expect(
			pool.query(
				"UPDATE messages SET ai_status = 'processing' WHERE id = 'chk-1'",
			),
		).rejects.toThrow(/messages_ai_status_check/)
	})

	test("a skipped message is not sent to the model", async () => {
		if (!reachable) return
		await seed([
			{ id: "skip-1", channel: SKIP_CHANNEL },
			{ id: "keep-1", channel: NORMAL_CHANNEL },
		])

		const llm = scriptedGateway((req) => {
			const ids = [...req.user.matchAll(/<message id="([^"]+)"/g)].map(
				(m) => m[1],
			)
			return verdictFor(ids)
		})
		const worker = new ModerationWorker(pool, llm, TEST_WORKER_CONFIG)
		await worker.runOnce()

		expect(llm.seenIds).not.toContain("skip-1")
		expect(llm.seenIds).toContain("keep-1")
	})

	test("it lands in the terminal 'skipped' state, not back in the queue", async () => {
		if (!reachable) return
		await seed([{ id: "skip-2", channel: SKIP_CHANNEL }])
		const llm = scriptedGateway((req) => {
			const ids = [...req.user.matchAll(/<message id="([^"]+)"/g)].map(
				(m) => m[1],
			)
			return verdictFor(ids)
		})
		const worker = new ModerationWorker(pool, llm, TEST_WORKER_CONFIG)
		await worker.runOnce()

		const { rows } = await pool.query<{
			ai_status: string
			worker_id: string | null
			lease_until: string | null
		}>(
			"SELECT ai_status, worker_id, lease_until FROM messages WHERE id = 'skip-2'",
		)
		expect(rows[0].ai_status).toBe("skipped")
		// No claim is held and no lease is outstanding: a skipped row must not be
		// reclaimable, or the next poll re-offers it.
		expect(rows[0].worker_id ?? null).toBeNull()
		expect(rows[0].lease_until ?? null).toBeNull()
	})

	test("it is never re-claimed on a later poll", async () => {
		if (!reachable) return
		await seed([
			{ id: "skip-3", channel: SKIP_CHANNEL },
			{ id: "keep-3", channel: NORMAL_CHANNEL },
		])
		const llm = scriptedGateway((req) => {
			const ids = [...req.user.matchAll(/<message id="([^"]+)"/g)].map(
				(m) => m[1],
			)
			return verdictFor(ids)
		})
		const worker = new ModerationWorker(pool, llm, TEST_WORKER_CONFIG)

		await worker.runOnce()
		const callsAfterFirst = llm.calls
		// Drain everything else, then poll again several times. A re-claim loop
		// would show up as extra calls naming skip-3.
		for (let i = 0; i < 3; i++) {
			await pool.query("UPDATE messages SET ready_for_work_at = 0")
			await worker.runOnce()
		}

		expect(llm.seenIds).not.toContain("skip-3")
		// No LLM call at all after the first pass: the queue is empty, not looping.
		expect(llm.calls).toBe(callsAfterFirst)

		const { rows } = await pool.query<{ ai_status: string }>(
			"SELECT ai_status FROM messages WHERE id = 'skip-3'",
		)
		expect(rows[0].ai_status).toBe("skipped")
	})

	test("skipping consumes no retry budget", async () => {
		if (!reachable) return
		await seed([{ id: "skip-4", channel: SKIP_CHANNEL }])
		const worker = new ModerationWorker(
			pool,
			scriptedGateway(() => "never called"),
			TEST_WORKER_CONFIG,
		)

		await worker.runOnce()
		await worker.runOnce()
		await worker.runOnce()

		// The re-claim loop incremented `attempts` on every pass, so a skipped
		// message carried an ever-growing count and could reach the attempt cap
		// while never having been analysed. One claim, one attempt.
		const { rows } = await pool.query<{ attempts: number; ai_status: string }>(
			"SELECT attempts, ai_status FROM messages WHERE id = 'skip-4'",
		)
		expect(rows[0].attempts).toBe(1)
		expect(rows[0].ai_status).toBe("skipped")
	})

	test("a skipped message gets no verdict row", async () => {
		if (!reachable) return
		await seed([{ id: "skip-5", channel: SKIP_CHANNEL }])
		const worker = new ModerationWorker(
			pool,
			scriptedGateway(() => verdictFor(["skip-5"])),
			TEST_WORKER_CONFIG,
		)
		await worker.runOnce()

		// No verdict means the auto-delete enforcer can never select it either, so
		// nothing in a skipped channel is ever deleted.
		const { rows } = await pool.query<{ n: number }>(
			"SELECT count(*)::int n FROM verdicts WHERE message_id = 'skip-5'",
		)
		expect(rows[0].n).toBe(0)
	})

	test("a thread inherits its parent's skip", async () => {
		if (!reachable) return
		// `messages.channel_id` is the PARENT for a thread (getMessageLocation
		// writes parentId there), so keying the skip on channel_id covers threads
		// under an exempt channel for free — the same rule EXCLUDED_CHANNEL_IDS
		// uses at capture time.
		await seed([
			{ id: "thread-skip", channel: SKIP_CHANNEL },
			{ id: "thread-keep", channel: NORMAL_CHANNEL },
		])
		await pool.query(
			"UPDATE messages SET thread_id = 't-' || id WHERE id LIKE 'thread-%'",
		)

		const llm = scriptedGateway((req) => {
			const ids = [...req.user.matchAll(/<message id="([^"]+)"/g)].map(
				(m) => m[1],
			)
			return verdictFor(ids)
		})
		const worker = new ModerationWorker(pool, llm, TEST_WORKER_CONFIG)
		await worker.runOnce()

		expect(llm.seenIds).not.toContain("thread-skip")
		expect(llm.seenIds).toContain("thread-keep")
	})

	test("an empty skip list skips nothing", async () => {
		if (!reachable) return
		// The default must be "moderate", not "skip" — a mis-set env var must not
		// silently unmoderate a whole channel.
		await seed([{ id: "noskip-1", channel: SKIP_CHANNEL }])
		const llm = scriptedGateway((req) => {
			const ids = [...req.user.matchAll(/<message id="([^"]+)"/g)].map(
				(m) => m[1],
			)
			return verdictFor(ids)
		})
		const worker = new ModerationWorker(pool, llm, {
			...TEST_WORKER_CONFIG,
			skipChannelIds: [],
			skipThreadIds: [],
		})
		await worker.runOnce()

		expect(llm.seenIds).toContain("noskip-1")
		const { rows } = await pool.query<{ ai_status: string }>(
			"SELECT ai_status FROM messages WHERE id = 'noskip-1'",
		)
		expect(rows[0].ai_status).toBe("analyzed")
	})
})

describe("a single exempt thread inside a moderated channel", () => {
	// This block is the last one before the migration sentinel, which rebuilds
	// `messages_ai_status_check` WITHOUT 'skipped' to simulate a database stuck
	// at 0022. Postgres validates existing rows on that ALTER, so a single row
	// left behind as `skipped` here fails the sentinel with a constraint
	// violation that looks nothing like a migration bug. Leave no rows.
	afterEach(async () => {
		if (!reachable) return
		await pool.query(
			"TRUNCATE messages, verdicts, analysis_attempts, attachments",
		)
	})

	test("its messages are never analysed", async () => {
		if (!reachable) return
		// The channel here is NORMAL_CHANNEL — fully moderated — and only the
		// thread is exempt. This is the case the channel list cannot express:
		// `messages.channel_id` holds the parent id, so a thread id added to
		// skipChannelIds matches nothing and the thread stays moderated.
		await seed([
			{ id: "thr-in", channel: NORMAL_CHANNEL, thread: SKIP_THREAD },
			{ id: "thr-out", channel: NORMAL_CHANNEL, thread: "other-thread" },
			{ id: "thr-none", channel: NORMAL_CHANNEL },
		])

		const llm = scriptedGateway((req) => {
			const ids = [...req.user.matchAll(/<message id="([^"]+)"/g)].map(
				(m) => m[1],
			)
			return verdictFor(ids)
		})
		const worker = new ModerationWorker(pool, llm, TEST_WORKER_CONFIG)
		await worker.runOnce()

		expect(llm.seenIds).not.toContain("thr-in")
		expect(llm.seenIds).toContain("thr-out")
		expect(llm.seenIds).toContain("thr-none")
	})

	test("it lands in the terminal 'skipped' state, not back in the queue", async () => {
		if (!reachable) return
		await seed([
			{ id: "thr-term", channel: NORMAL_CHANNEL, thread: SKIP_THREAD },
		])
		const llm = scriptedGateway(() => "never called")
		const worker = new ModerationWorker(pool, llm, TEST_WORKER_CONFIG)
		await worker.runOnce()

		const { rows } = await pool.query<{
			ai_status: string
			worker_id: string | null
			lease_until: string | null
			attempts: number
		}>(
			`SELECT ai_status, worker_id, lease_until, attempts
         FROM messages WHERE id = 'thr-term'`,
		)
		expect(rows[0].ai_status).toBe("skipped")
		expect(rows[0].worker_id ?? null).toBeNull()
		expect(rows[0].lease_until ?? null).toBeNull()
		// One claim, one attempt — the skip consumes no retry budget.
		expect(rows[0].attempts).toBe(1)
	})

	test("neither list matches the other's column", async () => {
		if (!reachable) return
		// Guards the reason this list exists, in both directions. A thread id typed
		// into AI_SKIP_ANALYSIS_CHANNEL_IDS must match nothing (it never appears in
		// channel_id), and a channel id typed into AI_SKIP_ANALYSIS_THREAD_IDS
		// must match nothing either (it never appears in thread_id). Crossing the
		// two columns would let a typo exempt a whole channel instead of one
		// thread — far worse than the bug being fixed.
		await seed([
			// Parent exempt, own thread is not on any list → skipped via channel.
			{ id: "thr-wrongchan", channel: SKIP_CHANNEL, thread: "t-xyz" },
			// Parent is normal, but thread_id carries the CHANNEL id → still judged.
			{ id: "thr-wrongchan2", channel: NORMAL_CHANNEL, thread: SKIP_CHANNEL },
		])
		const llm = scriptedGateway((req) => {
			const ids = [...req.user.matchAll(/<message id="([^"]+)"/g)].map(
				(m) => m[1],
			)
			return verdictFor(ids)
		})
		const worker = new ModerationWorker(pool, llm, TEST_WORKER_CONFIG)
		await worker.runOnce()

		const { rows } = await pool.query<{ id: string; ai_status: string }>(
			"SELECT id, ai_status FROM messages WHERE id IN ('thr-wrongchan','thr-wrongchan2')",
		)
		const byId = Object.fromEntries(rows.map((r) => [r.id, r.ai_status]))
		expect(byId["thr-wrongchan"]).toBe("skipped")
		expect(llm.seenIds).not.toContain("thr-wrongchan")
		// thr-wrongchan2's channel is not exempt and its thread_id is not on the
		// thread list, so it is analysed — a channel id in the thread list does
		// not exempt a whole channel.
		expect(byId["thr-wrongchan2"]).toBe("analyzed")
		expect(llm.seenIds).toContain("thr-wrongchan2")
	})

	test("an exempt thread under an exempt channel still lands in skipped", async () => {
		if (!reachable) return
		// Both lists apply; the channel wins the label because it is the broader
		// rule, and one `skipped` write is all it takes either way.
		await seed([{ id: "thr-both", channel: SKIP_CHANNEL, thread: SKIP_THREAD }])
		const llm = scriptedGateway(() => "never called")
		const worker = new ModerationWorker(pool, llm, TEST_WORKER_CONFIG)
		await worker.runOnce()

		const { rows } = await pool.query<{ ai_status: string }>(
			"SELECT ai_status FROM messages WHERE id = 'thr-both'",
		)
		expect(rows[0].ai_status).toBe("skipped")
	})
})

describe("the migration baseline", () => {
	test("the journal is contiguous and every entry has a file", async () => {
		if (!reachable) return
		// The migration history was squashed from 28 files to a single baseline.
		// What replaced the old sentinel machinery is the simplest possible
		// invariant, and this is the test that holds it in place: a database is
		// fully migrated only when every journal entry is recorded in
		// __drizzle_migrations.
		//
		// The sentinel this replaces had twice stamped a migration applied WITHOUT
		// running it, so production booted healthy against a schema missing its
		// `verdicts` table. The property that keeps that failure mode impossible is
		// NOT "there is exactly one migration" — 0002 (deleted rows leave the
		// queue) is a legitimate second one. It is that the journal Drizzle reads
		// and the files on disk agree, in order, with no gaps: a `.sql` file that
		// no journal entry names is never executed (the migrator only reads the
		// journal), and a journal entry with no file throws at boot.
		//
		// That exact mismatch happened here: a hand-written `0001_*.sql` was added
		// without a journal entry, so it would have deployed while doing nothing.
		// The file was re-created as 0002 through `drizzle-kit generate --custom`,
		// which is what writes the journal. This test is the guard.
		const { readFile, readdir } = await import("node:fs/promises")
		const journal = JSON.parse(
			await readFile(
				new URL("../drizzle/migrations/meta/_journal.json", import.meta.url),
				"utf-8",
			),
		) as { entries: Array<{ idx: number; tag: string; when: number }> }

		// Contiguous indices from 0, in the order the migrator applies them.
		expect(journal.entries.map((e) => e.idx)).toEqual(
			journal.entries.map((_, i) => i),
		)
		// The migrator applies "everything newer than MAX(created_at)", so a
		// non-monotonic `when` silently skips an entry.
		const when = journal.entries.map((e) => e.when)
		expect(when).toEqual([...when].sort((a, b) => a - b))
		// The baseline must still be the one that builds the schema.
		expect(journal.entries[0].tag).toBe("0000_baseline")

		// Every entry has its file, and no file is orphaned from the journal.
		const dir = new URL("../drizzle/migrations/", import.meta.url)
		const files = (await readdir(dir))
			.filter((f) => f.endsWith(".sql"))
			.map((f) => f.replace(/\.sql$/, ""))
			.sort()
		expect(journal.entries.map((e) => e.tag).sort()).toEqual(files)

		// And the schema that baseline describes must be the one actually live: the
		// tables the application reads must all exist, and the queue function the
		// worker calls must be there with the signature it uses.
		//
		// Deliberately NOT an exact table count. A developer database accumulates
		// tables that no migration owns (probe scratch tables, ad-hoc replicas), and
		// pinning a total would fail this suite for reasons that have nothing to do
		// with whether the baseline is correct. What must hold is that nothing the
		// baseline creates is MISSING. The equal-length check below is what catches
		// a table that the baseline silently stopped creating.
		const requiredTables = [
			"messages",
			"verdicts",
			"attachments",
			"analysis_attempts",
			"message_reviews",
			"user_profiles",
			"channel_cultures",
			"term_glossary_cache",
			"ui_state",
			"retention_policies",
			"chatbot_messages",
			"moderation_actions",
			"message_edits",
			"message_reactions",
		]
		const { rows: required } = await pool.query<{ table_name: string }>(
			`SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])`,
			[requiredTables],
		)
		expect(required.map((r) => r.table_name).sort()).toEqual(
			[...requiredTables].sort(),
		)

		const { rows: fn } = await pool.query<{ args: string }>(
			`SELECT pg_get_function_arguments(oid) AS args FROM pg_proc
        WHERE proname = 'claim_messages'`,
		)
		expect(fn).toHaveLength(1)
		expect(fn[0].args).toContain("p_worker_id")
		expect(fn[0].args).toContain("p_excluded_channel_ids")

		// 0002 is applied, not merely present on disk. The trigger is the half of
		// it that keeps the queue drained from here on, so testing for it is the
		// cheapest proof that the statement actually ran.
		const { rows: trigger } = await pool.query<{ tgname: string }>(
			"SELECT tgname FROM pg_trigger WHERE tgname = 'messages_deleted_dequeue'",
		)
		expect(trigger).toHaveLength(1)
	})
})
