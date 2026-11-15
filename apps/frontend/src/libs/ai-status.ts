import type {
	TDisplayVerdict,
	TPipelineStatus,
	TVerdictStatus,
} from "./types/index.ts"

/**
 * The moderation state machine, in one place.
 *
 * There are TWO independent axes and conflating them is the single most
 * expensive bug this dashboard has had:
 *
 *   `messages.ai_status`  — WHERE the message is in the queue.
 *                            pending | claimed | analyzed | retry_wait
 *                            dead | skipped
 *                            A hard CHECK constraint (migration 0020, widened
 *                            by 0023) rejects anything else, so the v1 names
 *                            ("processing", "clean", "flagged"…) can never be
 *                            written.
 *
 *   `verdicts.status`     — WHAT the model decided.
 *                            clean | deleted | error
 *
 * So "still queued" and "judged clean" are different facts. A message that is
 * `pending` has no outcome yet; rendering it as clean is a lie, and a filter
 * written against `ai_status IN ('flagged')` can never match a row.
 *
 * `skipped` is the other end: terminal, and deliberately un-judged. The message
 * was captured and is on the dashboard, but its channel is exempt from
 * moderation, so it has no verdict — not a clean one, and not an error.
 */

export const PIPELINE_STATUSES: readonly TPipelineStatus[] = [
	"pending",
	"claimed",
	"analyzed",
	"retry_wait",
	"dead",
	"skipped",
] as const

export const VERDICT_STATUSES: readonly TVerdictStatus[] = [
	"clean",
	"deleted",
	"error",
] as const

/** True only for values the DB CHECK constraint will accept. */
export function isPipelineStatus(value: unknown): value is TPipelineStatus {
	return (
		typeof value === "string" &&
		(PIPELINE_STATUSES as readonly string[]).includes(value)
	)
}

export function isVerdictStatus(value: unknown): value is TVerdictStatus {
	return (
		typeof value === "string" &&
		(VERDICT_STATUSES as readonly string[]).includes(value)
	)
}

/**
 * Read a filter value out of a URL query parameter (W2).
 *
 * Returns the caller's "unfiltered" sentinel when the parameter is absent OR is
 * not one the backend accepts. The validation is the point: these strings go
 * straight into the oRPC call, and `messageQuerySchema` is a Zod enum, so an
 * unvalidated `?status=whatever` from a shared or hand-edited URL would reject
 * the whole request and take the page down with it.
 *
 * Shared by the messages and moderation views so both validate identically.
 */
export function filterFromUrl(
	// `| undefined`: a search param absent from the URL arrives as undefined,
	// while a caller holding a nullable channel/message id arrives as null.
	// Both mean "not supplied", so both fall through to `unfiltered`.
	value: string | null | undefined,
	allowed: readonly string[],
	unfiltered: string,
): string {
	return value != null && allowed.includes(value) ? value : unfiltered
}

export type TVerdictTone = "neutral" | "positive" | "warning" | "danger"

/**
 * Map a verdict to a tone. `"unjudged"` is neutral, NOT positive: it means the
 * worker has not concluded, and painting it green would understate the backlog.
 *
 * `deleted` is danger for the same reason `flagged` was — it is the outcome
 * that acted on the message, and the one a moderator needs to see.
 */
export function verdictTone(
	verdict: TDisplayVerdict | null | undefined,
): TVerdictTone {
	switch (verdict) {
		case "deleted":
			return "danger"
		case "error":
			return "warning"
		case "clean":
			return "positive"
		default:
			return "neutral"
	}
}

export function verdictLabel(
	verdict: TDisplayVerdict | null | undefined,
): string {
	switch (verdict) {
		// The DECISION is called "flagged", not "deleted": deletion is a separate,
		// downstream fact (see `deletedBy`). Labelling both "Deleted" printed the
		// word twice on every bot-removed message and read as a stutter.
		case "deleted":
			return "Flagged"
		case "error":
			return "Error"
		case "clean":
			return "Clean"
		case "unjudged":
			return "Unjudged"
		default:
			return "Unknown"
	}
}

/**
 * Who removed the message from Discord — the distinction a bare `deleted_at`
 * cannot make.
 *
 * Discord's `messageDelete` event fires for EVERY deletion, moderator or bot,
 * so `deleted_at` only records THAT something was deleted. It never says who.
 * The bot's own deletions are recoverable from a second source: the gateway's
 * auto-delete enforcer is the only writer of `verdicts.auto_delete_state`, and
 * it always leaves a state behind — `done` on success, `failed` if Discord
 * refused, `claimed`/`pending` while in flight.
 *
 * So:
 *   bot    — deleted_at set AND auto_delete_state is non-null
 *   human  — deleted_at set AND auto_delete_state is null
 *   absent — nothing deleted; returns null so callers render no badge at all
 *
 * `pending`/`claimed` count as the bot: the bot DID act, and had a human beaten
 * it to the message its Discord call would have failed, leaving `failed`.
 */
export type TDeletedBy = "bot" | "human"

export function deletedBy(message: {
	deleted_at?: number | null
	auto_delete_state?: string | null
}): TDeletedBy | null {
	if (message.deleted_at == null) return null
	return message.auto_delete_state != null ? "bot" : "human"
}

/** Queue position as a label, with the meaning spelled out. */
export function pipelineLabel(
	status: TPipelineStatus | null | undefined,
): string {
	switch (status) {
		case "pending":
			return "Queued"
		case "claimed":
			return "Analyzing"
		case "analyzed":
			return "Analyzed"
		case "retry_wait":
			return "Retrying"
		case "dead":
			return "Abandoned"
		// Deliberately not analysed: a channel on the skip list. NOT an error
		// and not "queued" — the message was captured and will never be judged.
		case "skipped":
			return "Not moderated"
		default:
			return "Unknown"
	}
}

/**
 * The pipeline label to show for a message, given what has happened to it.
 *
 * A message can leave the queue without ever being judged: the author or a
 * moderator deletes it before a worker gets to it. `deleted_at` was set, but
 * `ai_status` still read `pending`, so the card printed
 *
 *     Queued        Deleted by moderator
 *
 * side by side — a row presented as still waiting in line that no worker would
 * ever claim. That is not a stale ordering problem, it is a stuck queue, and it
 * is why `pipelineLabel(status)` alone is the wrong function to call here.
 *
 * Migration 0001 now moves such rows to `skipped`, so the database no longer
 * produces the combination. This guard stays anyway, for two reasons: rows
 * written before that migration are still in the table, and the dashboard's
 * live feed keeps its own copy of a message between an edit and the next
 * refetch. Both would otherwise keep rendering "Queued" on a deleted message.
 *
 * A `claimed` row keeps its `Analyzing` label: a worker really does hold it, and
 * relabelling it here would contradict what the worker is about to report.
 */
export function pipelineLabelFor(message: {
	ai_status?: TPipelineStatus | null
	deleted_at?: number | null
}): string {
	// Only the two QUEUE states are rewritten. `analyzed`, `skipped` and `dead`
	// are already terminal, and an analyzed message that was deleted afterwards
	// is a different fact entirely — the model did judge it, and the card must
	// still say so. `claimed` keeps its label: a worker really does hold it, and
	// relabelling mid-flight would contradict the verdict it is about to publish.
	if (
		message.deleted_at != null &&
		(message.ai_status === "pending" || message.ai_status === "retry_wait")
	) {
		// Matches `pipelineLabel("skipped")`: not an error, and not queued —
		// nothing is going to judge it, because there is nothing left to judge.
		return "Not moderated"
	}
	return pipelineLabel(message.ai_status)
}

export function pipelineTone(
	status: TPipelineStatus | null | undefined,
): TVerdictTone {
	switch (status) {
		case "dead":
			return "danger"
		// Neutral, not positive: `analyzed` is green because a judgement was
		// reached, and nothing was judged here. Not a warning either.
		case "skipped":
			return "neutral"
		case "retry_wait":
			return "warning"
		case "claimed":
			return "neutral"
		case "analyzed":
			return "positive"
		default:
			return "neutral"
	}
}
