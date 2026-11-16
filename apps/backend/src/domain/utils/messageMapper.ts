// Shared message row mapper for backend repository modules

function resolveServerNick(row: Record<string, unknown>): string | null {
	const metadata = row.metadata
	if (!metadata || typeof metadata !== "string") {
		return orNull<string>(row.username)
	}
	try {
		const parsed = JSON.parse(metadata) as {
			member?: { displayName?: string | null } | null
		}
		return parsed?.member?.displayName ?? orNull<string>(row.username)
	} catch {
		return orNull<string>(row.username)
	}
}

/** `undefined` and `null` both become `null`; no runtime coercion. */
function orNull<T>(value: unknown): T | null {
	return (value as T | null) ?? null
}

/**
 * `null`/`undefined` stay `null`, anything else goes through `Number(...)`.
 * The null check comes first on purpose: "never happened" and "happened at
 * epoch zero" are different facts, and `Number(null)` would turn the first
 * into the second.
 */
function numberOrNull(value: unknown): number | null {
	return value == null ? null : Number(value)
}

export interface MappedMessage {
	id: string
	guild_id: string
	channel_id: string
	thread_id: string | null
	user_id: string
	username: string
	/** Member's server-specific display name (nickname), from metadata.member.displayName. Falls back to username when absent. */
	server_nick: string | null
	avatar_url: string | null
	content: string
	edited_content: string | null
	created_at: number
	edited_at: number | null
	deleted_at: number | null
	type: string
	metadata: string | null
	ai_status: string | null
	// Claim/retry bookkeeping from `messages`.
	//
	// TYPED AS BIGINT ON PURPOSE, even though `mapMessageRow` emits numbers. These
	// are the RAW columns as Prisma returns them, and `lease_until` /
	// `ready_for_work_at` are BigInt in Postgres. Declaring them `number` is what
	// let `(row.lease_until as number | null)` typecheck — a cast that silences
	// the compiler while the runtime value stays a `bigint` and breaks JSON
	// serialisation on the way to the browser. Typing the input honestly makes
	// every one of those conversions a compile error until it is written as a
	// real `Number(...)`.
	attempts?: number | null
	worker_id?: string | null
	lease_until?: bigint | null
	ready_for_work_at?: bigint | null
	// The mapper's OUTPUT names for that bookkeeping — kept under the `ai_`
	// prefix so existing dashboard code can find them next to ai_status.
	/** Retry count; the cap is maxAttempts. `dead` means it ran out. */
	ai_attempts: number | null
	/** Worker currently holding the claim lease, if any. */
	ai_worker_id: string | null
	/** Epoch millis when the current claim lease expires. */
	ai_lease_until: number | null
	/** Epoch millis before which the worker must not touch this message. */
	ai_ready_for_work_at: number | null
	// Joined verdict columns (aliased `verdict_*` by the repository)
	verdict_status?: string | null
	verdict_score?: number | null
	verdict_confidence?: number | null
	verdict_flags?: string[] | null
	verdict_categories?: string[] | null
	/** Why the model deleted it. Null for a clean verdict and for pre-0025 rows. */
	verdict_reason?: string | null
	verdict_analysis?: string | null
	verdict_evidence?: unknown
	verdict_model?: string | null
	verdict_updated_at?: number | null
	// Written only by the gateway's auto-delete enforcer. Non-null here means
	// THE BOT deleted the message; null plus a deleted_at means a human did.
	auto_delete_state?: string | null
	ai_moderation_flags: string | null
	ai_moderation_score: number | null
	ai_analysis: string | null
	ai_categories: string | null
	ai_confidence: number | null
	ai_analyzed_at: number | null
	ai_analysis_duration_ms: number | null
	ai_error: string | null
	is_reply: boolean | null
	is_forward: boolean | null
	is_crosspost: boolean | null
	reference_message_id: string | null
	reference_channel_id: string | null
	reference_guild_id: string | null
}

export function mapMessageRow(row: Record<string, unknown>): MappedMessage {
	return {
		id: String(row.id ?? ""),
		guild_id: String(row.guild_id ?? ""),
		channel_id: String(row.channel_id ?? ""),
		thread_id: orNull<string>(row.thread_id),
		user_id: String(row.user_id ?? ""),
		username: String(row.username ?? ""),
		server_nick: resolveServerNick(row),
		avatar_url: orNull<string>(row.avatar_url),
		content: String(row.content ?? ""),
		edited_content: orNull<string>(row.edited_content),
		created_at: Number(row.created_at ?? 0),
		// BigInt columns, so `Number(...)` is required — see `verdict_updated_at`
		// below. These are the two the "Edited" / "deleted" badges read, so a
		// `bigint` here is not merely unserialisable: it breaks the arithmetic that
		// decides whether to render those badges at all.
		edited_at: numberOrNull(row.edited_at),
		deleted_at: numberOrNull(row.deleted_at),
		type: String(row.type ?? "text"),
		metadata: orNull<string>(row.metadata),
		// Pipeline position, NOT the judgement. `analyzed` only means the worker is
		// finished with this message. The moderation outcome is `verdict_status`
		// below, which comes from the `verdicts` table.
		ai_status: orNull<string>(row.ai_status),
		// Retry bookkeeping, so the dashboard can show stuck work without a second
		// query. `dead` is the state that means "the worker gave up".
		//
		// `lease_until` and `ready_for_work_at` are BigInt columns, so `Number(...)`
		// is load-bearing, not decoration — see the note on `verdict_updated_at`
		// below for why a cast is not enough. `attempts` is an int column and is
		// left as-is.
		ai_attempts: orNull<number>(row.attempts),
		ai_worker_id: orNull<string>(row.worker_id),
		ai_lease_until: numberOrNull(row.lease_until),
		ai_ready_for_work_at: numberOrNull(row.ready_for_work_at),
		// ── Verdict (from `verdicts`, joined by the repository) ────────────────
		// null means "not judged yet" — which is now distinguishable from
		// "judged clean". Before the split those were the same value.
		verdict_status: orNull<string>(row.verdict_status),
		verdict_score: orNull<number>(row.verdict_score),
		verdict_confidence: orNull<number>(row.verdict_confidence),
		verdict_flags: orNull<string[]>(row.verdict_flags),
		verdict_categories: orNull<string[]>(row.verdict_categories),
		verdict_reason: orNull<string>(row.verdict_reason),
		verdict_analysis: orNull<string>(row.verdict_analysis),
		verdict_evidence: orNull<unknown>(row.verdict_evidence),
		verdict_model: orNull<string>(row.verdict_model),
		// COERCED, NOT CAST. `verdicts.updated_at` is a BigInt column, so this
		// arrives as a real `bigint` and a cast (`as number | null`) passes it
		// through untouched — which is what shipped BigInts to the browser. The
		// crash landed on `created_at` because the arithmetic was there, but every
		// BigInt column on a message row is the same hazard: `JSON.stringify`
		// throws on it, so the whole response fails rather than one field.
		//
		// `== null` first so a NULL column stays null instead of becoming 0 — "never
		// judged" and "judged at epoch zero" are different facts, and a 0 would
		// render as 56 years ago.
		verdict_updated_at: numberOrNull(row.verdict_updated_at),
		auto_delete_state: orNull<string>(row.auto_delete_state),
		// Legacy `messages.ai_*` columns. The new worker writes NOTHING here, so
		// these stay null for anything analysed after the rewrite; kept for older
		// rows and existing frontend code paths.
		ai_moderation_flags: orNull<string>(row.ai_moderation_flags),
		ai_moderation_score: orNull<number>(row.ai_moderation_score),
		ai_analysis: orNull<string>(row.ai_analysis),
		ai_categories: orNull<string>(row.ai_categories),
		ai_confidence: orNull<number>(row.ai_confidence),
		ai_analyzed_at: numberOrNull(row.ai_analyzed_at),
		ai_analysis_duration_ms: numberOrNull(row.ai_analysis_duration_ms),
		ai_error: orNull<string>(row.ai_error),
		is_reply: row.is_reply === null ? null : Boolean(row.is_reply),
		is_forward: row.is_forward === null ? null : Boolean(row.is_forward),
		is_crosspost: row.is_crosspost === null ? null : Boolean(row.is_crosspost),
		reference_message_id: orNull<string>(row.reference_message_id),
		reference_channel_id: orNull<string>(row.reference_channel_id),
		reference_guild_id: orNull<string>(row.reference_guild_id),
	}
}
