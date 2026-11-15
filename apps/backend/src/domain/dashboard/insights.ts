/**
 * Insights: the panels that answer "what did the model decide, how sure was it,
 * and what happened next".
 *
 * `getStats` counts; `getLeaderboards` ranks members and channels; this reduces
 * the three questions those two cannot express:
 *
 *  - **Which categories does the model actually act on?** A flag list is the
 *    vocabulary; the ranking is what the guild is being moderated for.
 *  - **How confident is it when it acts?** A deletion at 0.55 and a deletion at
 *    0.97 are the same verdict and a very different situation.
 *  - **Did the enforcement follow through?** A `deleted` verdict is a decision;
 *    `auto_delete_state` is whether the message actually went.
 *
 * Plus the two activity trails the console has no other view of — edits and the
 * media archive — and the freshness numbers that say whether the pipeline is
 * alive at all.
 *
 * Everything here is a pure reduction over flat rows so the rules can be proven
 * without a database; the repository's only job is to hand the rows over.
 */

/** One row per verdict. `confidence` is 0..1, `categories` is `text[]`. */
export interface VerdictInsightRow {
	status: string
	confidence: number
	categories: string[]
	/** null = never claimed by the enforcer, i.e. still queued. */
	auto_delete_state: string | null
	updated_at: number
}

/** One row per stored edit, with the message it belongs to LEFT JOINed in. */
export interface EditInsightRow {
	message_id: string
	edited_at: number
	/** null when retention has purged the message the edit points at. */
	user_id: string | null
	username: string | null
	/** Newest message timestamp per member, used to pick the current name. */
	created_at: number | null
}

/** One row per `attachments.upload_status` group. */
export interface MediaInsightRow {
	status: string
	count: number
	bytes: number
}

export interface CategoryCount {
	name: string
	count: number
}

export interface ConfidenceBucket {
	/** Inclusive lower bound, in percent (0, 20, 40, …). */
	min: number
	/** Exclusive upper bound, in percent. */
	max: number
	/** Every judged (non-error) verdict in the bucket. */
	count: number
	/** How many of them the model deleted. */
	deleted: number
}

export interface ConfidenceSummary {
	buckets: ConfidenceBucket[]
	/** Mean confidence over judged verdicts, 0..1, or null when none. */
	mean: number | null
	/**
	 * Share of DELETIONS whose confidence is below 0.6, in percent. This is the
	 * number worth acting on: enforcement resting on a weak call is the case a
	 * human should look at, and an overall mean hides it.
	 */
	low_share: number | null
	judged: number
}

export interface EnforcementSummary {
	/** `deleted` verdicts the enforcer settled. */
	enforced: number
	/** `deleted` verdicts the enforcer gave up on. */
	failed: number
	/** `deleted` verdicts claimed by an enforcer that is still working. */
	in_flight: number
	/** `deleted` verdicts with no enforcement yet (null or `pending`). */
	queued: number
	/** Verdicts that called for no action. */
	clean: number
	/** Verdicts that are a failure, not a judgement. */
	error: number
	/** Denominator for the four deletion buckets. */
	deleted_total: number
}

export interface EditorEntry {
	user_id: string
	username: string
	edits: number
}

export interface EditActivity {
	/** Every stored edit row, including ones whose message is gone. */
	total: number
	/** Distinct messages edited. */
	messages: number
	/** Edits in the last seven days. */
	last_7d: number
	/** Edits with no surviving message, so no author to attribute them to. */
	orphaned: number
	top_editors: EditorEntry[]
}

export interface MediaArchive {
	total: number
	uploaded: number
	pending: number
	failed: number
	bytes: number
	/** Bytes of the uploads that actually landed. */
	uploaded_bytes: number
}

export interface Freshness {
	last_message_at: number | null
	last_verdict_at: number | null
	last_deletion_at: number | null
	/** Oldest message still waiting for a verdict — the backlog's true age. */
	oldest_waiting_at: number | null
}

export interface Insights {
	categories: CategoryCount[]
	confidence: ConfidenceSummary
	enforcement: EnforcementSummary
	edits: EditActivity
	media: MediaArchive
	freshness: Freshness
}

const CATEGORY_LIMIT = 10
const BUCKET_COUNT = 5
/** Below this, a deletion is a call the model was not sure about. */
const LOW_CONFIDENCE = 0.6
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Categories of the messages the model DELETED, ranked.
 *
 * Not every verdict's categories: a clean verdict can still carry a category
 * (the model naming what it looked at), so counting all rows would mix "what we
 * act on" with "what we noticed". This panel is the first question.
 *
 * A category is counted once per verdict. `categories` is a `text[]` with no
 * duplicates in practice, but a duplicate would otherwise double-count one
 * message in a ranking that is read as a message count.
 */
export function buildFlagCategories(
	rows: readonly VerdictInsightRow[],
	limit = CATEGORY_LIMIT,
): CategoryCount[] {
	const counts = new Map<string, number>()
	for (const row of rows) {
		if (row.status !== "deleted") continue
		for (const raw of new Set(row.categories ?? [])) {
			const name = raw.trim()
			if (name === "") continue
			counts.set(name, (counts.get(name) ?? 0) + 1)
		}
	}

	return [...counts.entries()]
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
		.slice(0, limit)
}

/** Confidence in percent, clamped: a model that returns 1.4 is still 100%. */
function confidencePercent(value: number): number {
	if (!Number.isFinite(value)) return 0
	return Math.min(100, Math.max(0, value * 100))
}

/**
 * Confidence histogram over JUDGED verdicts, plus the two summary numbers.
 *
 * Error verdicts are excluded: their confidence is a field on a failure, not a
 * judgement, and folding it in would drag the mean toward whatever the error
 * path happens to write.
 *
 * The bucket is `floor(pct / 20)` with the top edge folded into the last
 * bucket, so a 100% verdict lands in 80–100 rather than in a sixth bucket that
 * holds one row.
 */
export function buildConfidence(
	rows: readonly VerdictInsightRow[],
): ConfidenceSummary {
	const buckets: ConfidenceBucket[] = Array.from(
		{ length: BUCKET_COUNT },
		(_, i) => ({
			min: (100 / BUCKET_COUNT) * i,
			max: (100 / BUCKET_COUNT) * (i + 1),
			count: 0,
			deleted: 0,
		}),
	)

	let judged = 0
	let total = 0
	let deletions = 0
	let lowDeletions = 0

	for (const row of rows) {
		if (row.status === "error") continue
		const pct = confidencePercent(row.confidence)
		const index = Math.min(
			BUCKET_COUNT - 1,
			Math.floor(pct / (100 / BUCKET_COUNT)),
		)
		const bucket = buckets[index]
		bucket.count += 1
		judged += 1
		total += pct
		if (row.status === "deleted") {
			bucket.deleted += 1
			deletions += 1
			if (row.confidence < LOW_CONFIDENCE) lowDeletions += 1
		}
	}

	return {
		buckets,
		mean: judged > 0 ? total / judged / 100 : null,
		low_share: deletions > 0 ? (lowDeletions / deletions) * 100 : null,
		judged,
	}
}

/**
 * What happened after the verdict.
 *
 * `deleted` is a decision, `auto_delete_state` is the follow-through, and the
 * gap between them is the only place a stuck enforcer is visible. A row that
 * was never claimed has a NULL state, which is the same situation as `pending`
 * and is reported with it — both mean "queued, nothing has touched it".
 *
 * "enforced" deliberately does not say "deleted the message": the enforcer also
 * settles name-only violations by resetting the nickname and keeping the
 * message, and it writes the same `done`. Claiming a deletion here would be a
 * number the guild could check and find wrong.
 */
export function buildEnforcement(
	rows: readonly VerdictInsightRow[],
): EnforcementSummary {
	const summary: EnforcementSummary = {
		enforced: 0,
		failed: 0,
		in_flight: 0,
		queued: 0,
		clean: 0,
		error: 0,
		deleted_total: 0,
	}

	for (const row of rows) {
		if (row.status === "error") {
			summary.error += 1
			continue
		}
		if (row.status !== "deleted") {
			summary.clean += 1
			continue
		}
		summary.deleted_total += 1
		switch (row.auto_delete_state) {
			case "done":
				summary.enforced += 1
				break
			case "failed":
				summary.failed += 1
				break
			case "claimed":
				summary.in_flight += 1
				break
			default:
				// null and "pending" are the same state from the reader's side.
				summary.queued += 1
		}
	}

	return summary
}

/**
 * Edit activity.
 *
 * A member is a `user_id`, not a username: someone who renamed mid-window is one
 * editor, and their displayed name is the one on their newest message — the same
 * rule `buildLeaderboards` applies, for the same reason.
 *
 * An edit whose message is gone (retention purges `messages`; `message_edits`
 * has no foreign key) still counts toward the total and toward its day, but
 * cannot be attributed to anyone. Those are `orphaned`, counted separately
 * rather than dropped, because a total that silently excludes them would
 * disagree with the Edits tab that lists them.
 */
export function buildEditActivity(
	rows: readonly EditInsightRow[],
	limit: number,
	now: number,
): EditActivity {
	const since = now - WEEK_MS
	const messages = new Set<string>()
	const byEditor = new Map<
		string,
		{ user_id: string; username: string; edits: number }
	>()
	const nameSeen = new Map<string, number>()

	let last7d = 0
	let orphaned = 0

	for (const row of rows) {
		messages.add(row.message_id)
		if (row.edited_at >= since) last7d += 1

		if (!row.user_id) {
			orphaned += 1
			continue
		}

		const entry = byEditor.get(row.user_id) ?? {
			user_id: row.user_id,
			// A member with no stored name is still a row; their id is the only
			// honest label left.
			username: row.username ?? row.user_id,
			edits: 0,
		}
		entry.edits += 1

		// Strictly newer, so among equal timestamps the first row wins — the
		// repository orders newest-first to make that the current name.
		const seen = nameSeen.get(row.user_id)
		const at = row.created_at ?? 0
		if (row.username && (seen === undefined || at > seen)) {
			entry.username = row.username
			nameSeen.set(row.user_id, at)
		}
		byEditor.set(row.user_id, entry)
	}

	return {
		total: rows.length,
		messages: messages.size,
		last_7d: last7d,
		orphaned,
		top_editors: [...byEditor.values()]
			.sort((a, b) => b.edits - a.edits || a.user_id.localeCompare(b.user_id))
			.slice(0, limit),
	}
}

/**
 * The media archive: what was captured, what landed, and what did not.
 *
 * `bytes` is every attachment ever captured, `uploaded_bytes` only the ones that
 * reached storage — the pair is the point, because "we archived 4 GB" and "we
 * archived 4 GB and kept 3 GB" are different claims. An unknown status is
 * counted in `total` but in none of the three buckets, so the buckets can never
 * claim more rows than exist.
 */
export function buildMediaArchive(
	rows: readonly MediaInsightRow[],
): MediaArchive {
	const media: MediaArchive = {
		total: 0,
		uploaded: 0,
		pending: 0,
		failed: 0,
		bytes: 0,
		uploaded_bytes: 0,
	}

	for (const row of rows) {
		const count = Number(row.count) || 0
		const bytes = Number(row.bytes) || 0
		media.total += count
		media.bytes += bytes
		switch (row.status) {
			case "uploaded":
				media.uploaded += count
				media.uploaded_bytes += bytes
				break
			case "pending":
				media.pending += count
				break
			case "failed":
				media.failed += count
				break
			default:
				break
		}
	}

	return media
}

/**
 * How alive the pipeline is.
 *
 * `last_verdict_at` is reduced from the verdict rows already in hand rather
 * than queried, so it cannot disagree with the panels beside it. `null` is a
 * real answer at every position — a guild with no messages has no last message
 * — and the UI has to render it as "never", not as 1970.
 */
export function buildFreshness(
	verdictRows: readonly VerdictInsightRow[],
	messageRow: {
		last_message_at: number | null
		last_deletion_at: number | null
		oldest_waiting_at: number | null
	},
): Freshness {
	let lastVerdict: number | null = null
	for (const row of verdictRows) {
		const at = Number(row.updated_at)
		if (!Number.isFinite(at)) continue
		if (lastVerdict === null || at > lastVerdict) lastVerdict = at
	}

	const num = (value: unknown): number | null => {
		if (value == null) return null
		const n = Number(value)
		return Number.isFinite(n) ? n : null
	}

	return {
		last_message_at: num(messageRow.last_message_at),
		last_verdict_at: lastVerdict,
		last_deletion_at: num(messageRow.last_deletion_at),
		oldest_waiting_at: num(messageRow.oldest_waiting_at),
	}
}

/** The whole payload, from rows the repository already has. */
export function buildInsights(
	input: {
		verdicts: readonly VerdictInsightRow[]
		edits: readonly EditInsightRow[]
		media: readonly MediaInsightRow[]
		messages: {
			last_message_at: number | null
			last_deletion_at: number | null
			oldest_waiting_at: number | null
		}
	},
	limit: number,
	now = Date.now(),
): Insights {
	return {
		categories: buildFlagCategories(input.verdicts),
		confidence: buildConfidence(input.verdicts),
		enforcement: buildEnforcement(input.verdicts),
		edits: buildEditActivity(input.edits, limit, now),
		media: buildMediaArchive(input.media),
		freshness: buildFreshness(input.verdicts, input.messages),
	}
}
