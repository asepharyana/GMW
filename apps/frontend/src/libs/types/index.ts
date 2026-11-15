/**
 * Local domain types for the dashboard.
 *
 * These are hand-maintained on purpose. The backend router is not imported
 * here: the frontend is a separate deployable with its own build, and coupling
 * it to backend generics would mean a backend schema change breaks the FE
 * typecheck for no benefit. Every call site asserts the backend's response to
 * one of these types, so a drift shows up as a wrong render, not a silent lie.
 *
 * Field names are snake_case because that is what the backend actually returns
 * (it is Drizzle over Postgres, no serialization layer).
 */

// ── Moderation state machine ────────────────────────────────────────────────

/**
 * QUEUE position, not the outcome. `messages.ai_status` has a hard CHECK
 * constraint (migration 0020, widened by 0023) allowing exactly these six.
 *
 * The v1 names ("processing", "clean", "warn", "flagged", "error") are NOT
 * valid here — a query filtering on them matches nothing, which is how the
 * review queue once rendered permanently empty.
 */
export type TPipelineStatus =
	| "pending"
	| "claimed"
	| "analyzed"
	| "retry_wait"
	| "dead"
	| "skipped"

/**
 * The JUDGEMENT, from the `verdicts` table. A separate column from
 * `ai_status` and never stored there.
 *
 * Two outcomes and a failure: the model either let the message through
 * (`clean`) or called for its removal (`deleted`). There is no severity scale
 * to grade in between, so there is nothing between "fine" and "gone" — the
 * ordinal axis is gone from the schema, not just hidden in the UI.
 */
export type TVerdictStatus = "clean" | "deleted" | "error"

/**
 * The verdict as the dashboard reads it. The backend coalesces a missing
 * verdict row to the string `"unjudged"`, so that is a real value the UI must
 * handle — it means "the worker has not concluded yet", NOT "judged clean".
 */
export type TDisplayVerdict = TVerdictStatus | "unjudged"

// ── Messages ────────────────────────────────────────────────────────────────

export interface IGuild {
	id: string
	name: string
	icon: string | null
}

export interface ITextChannel {
	id: string
	name: string
	type: string
}

/** The judgement, joined onto a message by the backend. */
export interface IVerdictFields {
	verdict_status?: TVerdictStatus | null
	verdict_score?: number | null
	verdict_confidence?: number | null
	verdict_flags?: string[] | null
	verdict_categories?: string[] | null
	/**
	 * Why the model deleted it. Not a second decision — `verdict_status` already
	 * says whether the message goes — but the cause, so a deletion is auditable
	 * and appealable. Null for a clean verdict, and for rows judged before 0025.
	 */
	verdict_reason?: string | null
	verdict_analysis?: string | null
	verdict_evidence?: string[] | null
	verdict_model?: string | null
	verdict_policy_version?: string | null
	verdict_updated_at?: number | null
}

export interface IMessage extends IVerdictFields {
	id: string
	guild_id: string
	channel_id: string
	thread_id: string | null
	user_id: string
	username: string
	server_nick: string | null
	avatar_url: string | null
	content: string
	edited_content: string | null
	created_at: number
	edited_at: number | null
	deleted_at: number | null
	// Written only by the gateway's auto-delete enforcer, so a non-null value is
	// what separates "the bot deleted this" from "a human did" — `deleted_at`
	// alone cannot, because Discord's messageDelete fires for both. See
	// `deletedBy()` in #/libs/ai-status for the full reasoning.
	auto_delete_state?: string | null
	type: string
	metadata: string | null
	is_reply: boolean | null
	is_forward: boolean | null
	is_crosspost: boolean | null
	reference_message_id: string | null
	reference_channel_id: string | null
	reference_guild_id: string | null
	ai_status?: TPipelineStatus | null
	attempts?: number | null
	worker_id?: string | null
	// Legacy columns kept for the review row; the verdict_* fields are canonical.
	ai_confidence?: number | null
	ai_analysis?: string | null
	ai_categories?: string | null
}

export interface IMessageQuery {
	channelId?: string
	guildId?: string
	userId?: string
	status?: TPipelineStatus
	verdict?: TVerdictStatus
	needsReview?: boolean
	limit?: number
	offset?: number
	cursor?: string
	messageId?: string
}

export interface IMessagePage {
	data: IMessage[]
	nextCursor: string | null
}

export interface IAttachment {
	id: string
	message_id: string
	guild_id: string
	channel_id: string
	thread_id: string | null
	user_id: string
	filename: string
	size: number
	type: string
	discord_url: string
	uploaded_url: string | null
	upload_status: "pending" | "uploaded" | "failed"
	upload_error: string | null
	created_at: number
	uploaded_at: number | null
}

export interface IMessageEdit {
	id: string
	message_id: string
	old_content: string
	new_content: string
	edited_at: number
	channel_id: string
	channel_name: string | null
	username: string | null
}

export interface IReviewResult {
	results: IMessage[]
	limit: number
	cursor: string | null
}

// ── Dashboard ───────────────────────────────────────────────────────────────

export interface ITopChannel {
	channel_id: string
	channel_name: string
	message_count: number
}

export interface IQueueOverview {
	pending: number
	claimed: number
	retry_wait: number
	dead: number
	/** Terminal: captured, never analysed (channel on the skip list). */
	skipped: number
	error: number
}

export interface IDashboardStats {
	total_messages: number
	total_users: number
	total_flagged: number
	total_clean: number
	total_error: number
	total_pending: number
	total_claimed: number
	total_retry_wait: number
	total_dead: number
	total_skipped: number
	total_profiles: number
	today_messages: number
	today_flagged: number
	active_users_24h: number
	top_channels: ITopChannel[]
	moderation_overview: IQueueOverview
}

export interface IDailyActivity {
	day: string
	messages: number
	flagged: number
	active_users: number
}

export interface IHourlyActivity {
	hour: number
	messages: number
	flagged: number
}

export interface IDashboardActivity {
	days: number
	daily: IDailyActivity[]
	hourly: IHourlyActivity[]
}

/**
 * Leaderboards.
 *
 * Both member rankings carry the same two counts, because the interesting number
 * on either one is the ratio: a name with 40 messages and 3 deletions is a
 * different story from a name with 3 messages and 3 deletions. `total` is always
 * messages sent, `deleted` always messages the model deleted — the panel decides
 * which one it ranks by.
 */
export interface IUserLeaderboardEntry {
	user_id: string
	username: string
	total: number
	deleted: number
}

export interface IChannelLeaderboardEntry {
	channel_id: string
	channel_name: string
	total: number
	deleted: number
}

export interface IDashboardLeaderboards {
	top_offenders: IUserLeaderboardEntry[]
	most_active: IUserLeaderboardEntry[]
	problem_channels: IChannelLeaderboardEntry[]
}

export interface ITopReaction {
	message_id: string
	content: string
	username: string
	channel_id: string
	channel_name: string | null
	created_at: number
	reaction_count: number
	top_emojis: Array<{ emoji: string; count: number }>
}

export interface ITopReactor {
	user_id: string
	username: string
	net_count: number
	adds_count: number
	messages_reacted: number
	emojis_used: number
}

/**
 * Insights.
 *
 * The three questions the headline counters cannot answer — what the model acts
 * on, how sure it is, and whether enforcement followed through — plus the two
 * activity trails with no other view (edits, media) and the freshness numbers.
 *
 * Every timestamp here is epoch milliseconds or `null`. `null` means "never",
 * which is a real answer on a guild with no messages; rendering it as 1970 is
 * the bug this type is shaped to prevent.
 */
export interface ICategoryCount {
	name: string
	count: number
}

export interface IConfidenceBucket {
	/** Inclusive lower bound, in percent. */
	min: number
	/** Exclusive upper bound, in percent. */
	max: number
	count: number
	deleted: number
}

export interface IConfidenceSummary {
	buckets: IConfidenceBucket[]
	/** Mean confidence over judged verdicts, 0..1. */
	mean: number | null
	/** Share of DELETIONS made below 0.6 confidence, in percent. */
	low_share: number | null
	judged: number
}

export interface IEnforcementSummary {
	enforced: number
	failed: number
	in_flight: number
	/** `deleted` verdicts nothing has enforced yet. */
	queued: number
	clean: number
	error: number
	deleted_total: number
}

export interface IEditorEntry {
	user_id: string
	username: string
	edits: number
}

export interface IEditActivity {
	total: number
	messages: number
	last_7d: number
	/** Edits whose message retention already purged; attributable to nobody. */
	orphaned: number
	top_editors: IEditorEntry[]
}

export interface IMediaArchive {
	total: number
	uploaded: number
	pending: number
	failed: number
	bytes: number
	uploaded_bytes: number
}

export interface IFreshness {
	last_message_at: number | null
	last_verdict_at: number | null
	last_deletion_at: number | null
	oldest_waiting_at: number | null
}

export interface IDashboardInsights {
	categories: ICategoryCount[]
	confidence: IConfidenceSummary
	enforcement: IEnforcementSummary
	edits: IEditActivity
	media: IMediaArchive
	freshness: IFreshness
}

// ── Moderation ──────────────────────────────────────────────────────────────

export interface IModerationStats {
	total: number
	executed: number
	failed: number
	pending: number
	failed_rate: number
	/** Verdict status → count. Keyed by status, not by a separate action: the
	 *  decision is stated once, so there is nothing to group it by twice. */
	by_status: Record<string, number>
}

export interface IModerationTrends {
	categories: Array<{ name: string; count: number }>
	actions: Array<{ type: string; count: number }>
}

export interface IFlaggedDomain {
	domain: string
	count: number
}

export interface IFlaggedChannel {
	channel_id: string
	channel_name: string | null
	flagged_count: number
}

export interface IHourBucket {
	hour: number
	total: number
}

export interface IModerationActionRow {
	id: string
	message_id: string | null
	user_id: string | null
	guild_id: string
	action_type: string
	/** The pipeline's action word ("deleted"), not a sentence. */
	reason: string | null
	/** The model's own explanation, from `verdicts.analysis`. */
	analysis: string | null
	executed_by: string | null
	status: string
	error: string | null
	created_at: number
	executed_at: number | null
	flags: string[] | null
	categories: string[] | null
	confidence: number | null
	score: number | null
	evidence: string[] | null
	policy_version: string | null
	username: string | null
	server_nick: string | null
	content: string | null
}

export interface IModerationActionPage {
	data: IModerationActionRow[]
	nextCursor: string | null
}

export interface ICoverage {
	total: number
	completed: number
	failed: number
	pending: number
	outcomes: Record<string, number>
	coverage_rate: number
	failed_rate: number
}

// ── Chatbot / config / ui-state ─────────────────────────────────────────────

export interface IChatbotTurn {
	id: string
	user_id: string
	user_message: string
	bot_response: string
	/**
	 * Epoch milliseconds, NOT an ISO string.
	 *
	 * `chatbot_messages.created_at` is a bigint column and the repository
	 * returns `Number(r.created_at)`. The hand-written `lib/types/rpc.ts` mirror
	 * declared this as a string and was reached through `as unknown as`, so the
	 * mismatch was invisible until P4 replaced the mirror with oRPC's real
	 * `RouterClient` type — which is the entire point of doing that.
	 */
	created_at: number
	/** JSONB `context` column, or null. */
	context: Record<string, unknown> | null
}

export interface IAppConfig {
	monitorGuildId: string | null
	/** Every monitored guild. `monitorGuildId` is the first entry, or null. */
	monitorGuildIds: string[]
	webserverPort: number
	nodeEnv: string
	backlogSyncHours: number
	backlogSyncBatchSize: number
	retentionMessagesDays: number
	retentionAttachmentsDays: number
	logLevel: string
}
