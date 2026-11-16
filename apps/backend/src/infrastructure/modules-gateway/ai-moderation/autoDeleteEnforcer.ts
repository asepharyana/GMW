/**
 * Auto-delete enforcement loop.
 *
 * The rewrite deleted the auto-delete modules (894 lines) but left the config,
 * the `msg.delete()` call and the `MANAGE_MESSAGES` check. Nothing decided to
 * call any of it, so the gateway has deleted nothing since. This module is the
 * missing decision.
 *
 * WHY A POLL AND NOT AN EVENT
 * The worker that produces verdicts runs as a separate process and holds only
 * a database pool — deliberately, so a slow or failing model can never stall
 * message capture. It does not publish to Redis, and adding that would couple
 * the two processes again. The gateway already polls elsewhere (retention,
 * digest scheduler), so a bounded poll over the verdicts table keeps the
 * dependency direction intact: the gateway reads the database, the worker
 * writes it, neither waits on the other.
 *
 * WHY A SENTINEL COLUMN AND NOT `created_at`
 * Re-reading recent rows by timestamp would let a message be deleted twice
 * after a restart, and would have to guess how far back to look. Instead a row
 * is only considered once, and that decision is recorded on the verdict itself
 * so it survives restarts and is visible in the dashboard.
 */
import type { Client } from "discord.js-selfbot-v13"
import { sql } from "drizzle-orm"
import { config } from "../../config/index.js"
import { getDatabase } from "../../database/drizzle.js"
import type { DatabaseHandle } from "../../database/handle.js"
import { createChildLogger } from "../../logger/index.js"
import type { VerdictLike } from "./autoDeleteEligibility.js"
import {
	type AutoDeleteResult,
	attemptAutoDeleteFlaggedMessage,
} from "./autoDeleteManager.js"

const logger = createChildLogger("auto-delete-enforcer")

/** How often to look for newly judged messages. */
const POLL_INTERVAL_MS = 5_000
/** Never touch more than this per tick, so a backlog cannot stall capture. */
const BATCH_LIMIT = 10
/**
 * Floor on how long a claim is honoured before it counts as abandoned. A crash
 * mid-batch leaves rows in `claimed` forever otherwise, since nothing else
 * transitions them.
 */
const STALE_CLAIM_MS = 60_000

// The marker columns live on `verdicts` but are not part of the Drizzle
// schema for that table (it is declared read-only, since the gateway only ever
// appends verdicts via the worker). They are created by the baseline migration.
// Referenced by raw SQL on purpose: see the comment above.
const MARKER_COLUMNS = "auto_delete_state, auto_delete_claimed_at"

interface Row {
	message_id: string
	status: string
	reason: string | null
	action: string | null
	confidence: number | null
	score: number | null
	categories: string[] | null
	flags: string[] | null
	analysis: string | null
	/** jsonb; the driver hands it back already parsed when it is a JSON array. */
	evidence: unknown
	policy_version: string | null
	auto_delete_state: string | null
	guild_id: string
	channel_id: string
	user_id: string
	thread_id: string | null
	username: string | null
	content: string | null
	edited_content: string | null
	metadata: unknown
}

/**
 * Normalise `verdicts.evidence` to a list of cited spans.
 *
 * The column is jsonb, so the driver may hand back an already-parsed array or
 * the raw JSON text depending on the value's shape (and on rows written before
 * the column was jsonb). Anything that is not a list of strings yields `[]`
 * rather than being coerced, so the audit trail never renders a stray object as
 * a citation.
 */
function normalizeEvidence(raw: unknown): string[] {
	if (Array.isArray(raw)) return raw.map(String).filter(Boolean)
	if (typeof raw !== "string" || raw.length === 0) return []
	try {
		const parsed: unknown = JSON.parse(raw)
		return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
	} catch {
		return []
	}
}

/** Verdicts awaiting a decision, oldest first. */
export async function claimUnenforced(
	limit: number,
	db: DatabaseHandle = getDatabase(),
): Promise<Row[]> {
	// AUTO_DELETE_FLAGGED_DELAY_MS is a grace period between "the model flagged
	// this" and "we delete it". It was declared in the schema and documented in
	// .env.example from the start, and read nowhere: setting it to 60000 to buy
	// time to appeal a deletion did nothing at all, and the only way to notice
	// was to watch a message vanish. A delay of 0 keeps the previous behaviour
	// exactly — the predicate is on created_at, so nothing else moves.
	const notBefore = Date.now() - config.AUTO_DELETE_FLAGGED_DELAY_MS
	// Two things this has to get right:
	//
	// 1. The candidate set is a CTE, and `messages` is joined in the UPDATE's own
	//    FROM clause. The first version put the join only in a subquery and then
	//    tried to RETURN the message columns — Postgres rejects that outright
	//    ("missing FROM-clause entry for table m"), so the loop failed every tick
	//    even with the columns present. A column is only RETURNable if it appears
	//    in the UPDATE's own FROM.
	//
	// 2. `FOR UPDATE OF v SKIP LOCKED` locks only the verdict rows, so two
	//    gateway processes can never both act on the same message and neither
	//    blocks waiting on the other.
	//
	// 3. `status = 'deleted'` is the "there is a violation to act on" flag, and
	//    it is NOT the same as "delete the message" — that is the category's job.
	//    A name-only violation is claimed here (status `deleted`) and then the
	//    manager KEEPS the message and resets the nickname instead, because
	//    `isNicknameOnlyViolation` reads the clean body. This one gate therefore
	//    covers both enforcement kinds, and the partial index below stays usable.
	//
	//    That is why widening this predicate with an OR arm for name categories
	//    is wrong: it would defeat `idx_verdicts_auto_delete_pending` (whose
	//    predicate is exactly `status = 'deleted'`) to admit rows the prompt
	//    never produces. All 51 real `offensive_nickname` verdicts in production
	//    are `status = 'deleted'`, and `policy.ts` requires that, so the rows
	//    arrive claimable. A prompt the model can disobey is not a reason to
	//    make the enforcer's hot query unscannable.
	const res = await db.execute(sql`
    WITH candidates AS (
      SELECT v.message_id
      FROM verdicts v
      JOIN messages m ON m.id = v.message_id
      WHERE v.status = 'deleted'
        -- An edit re-queues the message but leaves the previous verdict stored.
        -- Wait for the worker to finish judging the current content.
        AND m.ai_status = 'analyzed'
        AND m.deleted_at IS NULL
        AND v.created_at <= ${notBefore}
        AND (v.${sql.raw("auto_delete_state")} IS NULL
             OR v.${sql.raw("auto_delete_state")} = 'pending')
        -- Never delete inside a channel Discord marks NSFW. The flag lives in
        -- the metadata captured with the message, so an admin toggling the
        -- channel in Discord takes effect without a config change here.
        AND COALESCE((m.metadata::jsonb -> 'channel' ->> 'nsfw')::boolean, false)
            = false
      ORDER BY v.created_at ASC
      LIMIT ${limit}
      FOR UPDATE OF v SKIP LOCKED
    )
    UPDATE verdicts v
    SET ${sql.raw("auto_delete_state")} = 'claimed',
        ${sql.raw("auto_delete_claimed_at")} = ${Date.now()}
    FROM messages m
    WHERE v.message_id IN (SELECT message_id FROM candidates)
      AND m.id = v.message_id
    RETURNING v.message_id, v.status, v.reason, v.action, v.confidence, v.score,
              v.categories, v.flags, v.analysis, v.evidence, v.policy_version,
              m.guild_id, m.channel_id, m.user_id, m.thread_id, m.username,
              m.content, m.edited_content, m.metadata
  `)
	return Array.isArray(res)
		? (res as unknown as Row[])
		: ((res as unknown as { rows: Row[] }).rows ?? [])
}

async function markState(messageId: string, state: string): Promise<void> {
	const db = getDatabase()
	await db.execute(sql`
    UPDATE verdicts
    SET ${sql.raw("auto_delete_state")} = ${state},
        ${sql.raw("auto_delete_claimed_at")} = ${Date.now()}
    WHERE message_id = ${messageId}
  `)
}

/**
 * Re-queue rows stuck in `claimed` (gateway died mid-batch) so they are retried.
 */
async function releaseStaleClaims(): Promise<number> {
	// A claim older than the configured delay has outlived any plausible single
	// attempt, so the gateway holding it is gone. Tying the two constants to one
	// knob keeps the queue from stalling on a delay longer than the recovery
	// window: with a 5-minute grace period and a 60s recovery window, a message
	// claimed just before a crash is re-queued before it was ever eligible, which
	// is harmless, but the reverse pairing — a 0s delay — would re-queue a live
	// claim out from under a gateway that is merely slow.
	const cutoff =
		Date.now() - Math.max(config.AUTO_DELETE_FLAGGED_DELAY_MS, STALE_CLAIM_MS)
	const db = getDatabase()
	const res = await db.execute(sql`
    UPDATE verdicts
    SET ${sql.raw("auto_delete_state")} = 'pending'
    WHERE ${sql.raw("auto_delete_state")} = 'claimed'
      AND ${sql.raw("auto_delete_claimed_at")} < ${cutoff}
  `)
	const rows = Array.isArray(res) ? res : []
	return rows.length ?? 0
}

let timer: ReturnType<typeof setInterval> | null = null
let running = false

/**
 * Retry counts for rows whose target could not be resolved, so a permanently
 * bad channel id cannot be re-fetched from Discord on every tick forever.
 * Bounded, and cleared when a row settles.
 */
const attempts = new Map<string, number>()
const MAX_ATTEMPTS = 5

async function tick(client: Client): Promise<void> {
	if (running) return
	running = true
	try {
		const released = await releaseStaleClaims()
		if (released > 0) {
			logger.warn(
				{ released },
				"Re-queued auto-delete claims left by a dead gateway",
			)
		}

		const rows = await claimUnenforced(BATCH_LIMIT)
		if (rows.length === 0) return

		for (const row of rows) {
			const verdict: VerdictLike = {
				status: row.status,
				// Straight from the verdict row, for the audit trail only. The
				// manager does NOT read it: enforcement is re-derived from the
				// category here, in the gateway process, because the row was
				// written by the worker and may predate this build. NULL on every
				// row written before the column existed, which changes nothing.
				action: row.action,
				confidence: row.confidence,
				score: row.score,
				categories: row.categories ?? [],
				flags: row.flags ?? [],
				analysis: row.analysis,
				// The model's own quoted citations and the policy version that ruled.
				// Both are copied off the verdict row so the audit record can state
				// them; without this the manager wrote `evidence` from `flags` and left
				// `policy_version` NULL on every row.
				evidence: normalizeEvidence(row.evidence),
				policyVersion: row.policy_version,
			}

			let result: AutoDeleteResult
			try {
				result = await attemptAutoDeleteFlaggedMessage(
					client,
					{
						id: row.message_id,
						guild_id: row.guild_id,
						channel_id: row.channel_id,
						user_id: row.user_id,
						thread_id: row.thread_id,
						username: row.username,
						content: row.content,
						edited_content: row.edited_content,
						metadata: row.metadata,
					},
					verdict,
				)
			} catch (error) {
				// attemptAutoDeleteFlaggedMessage is contracted not to throw. If it
				// ever does, record the failure and move on — one bad message must not
				// stop the loop.
				logger.error(
					{
						messageId: row.message_id,
						error: error instanceof Error ? error.message : String(error),
					},
					"Auto-delete threw unexpectedly",
				)
				await markState(row.message_id, "failed")
				continue
			}

			// A skipped result is normally terminal: the message is not eligible and
			// will not become eligible, so recording it as done stops us re-reading
			// it every 5 seconds forever.
			//
			// Three reasons may fix themselves — a channel missing from the cache is
			// fetched now, so a miss there means the id is wrong or the channel is
			// gone, and a guild the client has not seen yet may appear. Those go back
			// to `pending`, but with a hard cap: a row that never resolves would
			// otherwise be re-queried and re-fetched from Discord every tick,
			// forever, on a single bad id. After MAX_ATTEMPTS it is marked failed
			// and the reason is already in moderation_actions.
			const retryable =
				result.reason === "guild_not_found" ||
				result.reason === "channel_not_found" ||
				result.reason === "unsupported_channel"
			if (result.deleted || !retryable) {
				attempts.delete(row.message_id)
				await markState(row.message_id, "done")
			} else {
				attempts.set(row.message_id, (attempts.get(row.message_id) ?? 0) + 1)
				const tries = attempts.get(row.message_id) ?? 0
				if (tries >= MAX_ATTEMPTS) {
					logger.warn(
						{ messageId: row.message_id, reason: result.reason, tries },
						"Auto-delete gave up after repeated attempts — marking failed",
					)
					attempts.delete(row.message_id)
					await markState(row.message_id, "failed")
				} else {
					await markState(row.message_id, "pending")
				}
			}

			logger.info(
				{
					messageId: row.message_id,
					reason: result.reason,
					deleted: result.deleted,
				},
				"Auto-delete decision applied",
			)
		}
	} catch (error) {
		logger.error(
			{ error: error instanceof Error ? error.message : String(error) },
			"Auto-delete tick failed",
		)
	} finally {
		running = false
	}
}

/**
 * Start the enforcement loop. Idempotent.
 */
export function startAutoDeleteEnforcer(client: Client): void {
	if (timer) return

	logger.info(
		{
			intervalMs: POLL_INTERVAL_MS,
			batch: BATCH_LIMIT,
		},
		"Starting auto-delete enforcement loop",
	)
	timer = setInterval(() => {
		void tick(client)
	}, POLL_INTERVAL_MS)
	// Do not hold the event loop open on shutdown.
	timer.unref?.()
}

export { MARKER_COLUMNS }
