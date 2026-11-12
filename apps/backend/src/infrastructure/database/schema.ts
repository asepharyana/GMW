import { sql } from "drizzle-orm"
import {
	bigint as pgBigint,
	boolean as pgBoolean,
	foreignKey as pgForeignKey,
	index as pgIndex,
	integer as pgInteger,
	jsonb as pgJsonb,
	real as pgReal,
	pgTable,
	text as pgText,
	timestamp as pgTimestamp,
	uuid as pgUuid,
} from "drizzle-orm/pg-core"

// =============================================================================
// Messages
// =============================================================================

/**
 * Messages Table (PostgreSQL)
 * Stores text messages with AI moderation analysis
 */
export const pgMessagesTable = pgTable(
	"messages",
	{
		id: pgText("id").primaryKey(),
		guild_id: pgText("guild_id").notNull(),
		channel_id: pgText("channel_id").notNull(),
		thread_id: pgText("thread_id"),
		user_id: pgText("user_id").notNull(),
		username: pgText("username").notNull(),
		avatar_url: pgText("avatar_url"),
		content: pgText("content").notNull(),
		edited_content: pgText("edited_content"),
		created_at: pgBigint("created_at", { mode: "number" }).notNull(),
		edited_at: pgBigint("edited_at", { mode: "number" }),
		deleted_at: pgBigint("deleted_at", { mode: "number" }),
		type: pgText("type", { enum: ["text", "edited", "deleted"] })
			.notNull()
			.default("text"),
		is_reply: pgBoolean("is_reply"),
		is_forward: pgBoolean("is_forward"),
		is_crosspost: pgBoolean("is_crosspost"),
		reference_message_id: pgText("reference_message_id"),
		reference_channel_id: pgText("reference_channel_id"),
		reference_guild_id: pgText("reference_guild_id"),
		metadata: pgText("metadata"),
		// The v2 state machine (migration 0020). The DB has a hard CHECK on
		// exactly this set, so the Drizzle enum must match it or code type-checks
		// against states the database rejects at runtime.
		ai_status: pgText("ai_status", {
			enum: ["pending", "claimed", "analyzed", "retry_wait", "dead", "skipped"],
		})
			.notNull()
			.default("pending"),
		ai_moderation_flags: pgText("ai_moderation_flags"),
		ai_moderation_score: pgReal("ai_moderation_score"),
		ai_analysis: pgText("ai_analysis"),
		ai_categories: pgText("ai_categories"),
		ai_confidence: pgReal("ai_confidence"),
		ai_analyzed_at: pgBigint("ai_analyzed_at", { mode: "number" }),
		ai_analysis_duration_ms: pgBigint("ai_analysis_duration_ms", {
			mode: "number",
		}),
		ai_error: pgText("ai_error"),
		// ── v2 state machine (migration 0020_moderation_state_machine.sql) ──────
		//
		// Added to the database by 0020 but never declared here, so the Drizzle
		// schema could not express the durable queue at all — every claim/lease/
		// retry path had to go through raw SQL, and code trying to use the ORM had
		// no column to name.
		attempts: pgInteger("attempts").notNull().default(0),
		ready_for_work_at: pgBigint("ready_for_work_at", { mode: "number" })
			.notNull()
			.default(0),
		lease_until: pgBigint("lease_until", { mode: "number" }),
		worker_id: pgText("worker_id"),
		last_error: pgText("last_error"),
		owner: pgText("owner").notNull().default("worker"),
		content_hash: pgText("content_hash"),
		context_key: pgText("context_key"),
	},
	(table) => ({
		channelIdx: pgIndex("idx_messages_channel").on(table.channel_id),
		userIdx: pgIndex("idx_messages_user").on(table.user_id),
		createdIdx: pgIndex("idx_messages_created").on(table.created_at),
		threadIdx: pgIndex("idx_messages_thread").on(table.thread_id),
		channelCreatedIdx: pgIndex("idx_messages_channel_created").on(
			table.channel_id,
			table.created_at,
			table.id,
		),
		threadCreatedIdx: pgIndex("idx_messages_thread_created").on(
			table.thread_id,
			table.created_at,
			table.id,
		),
		aiStatusCreatedIdx: pgIndex("idx_messages_ai_status_created").on(
			table.ai_status,
			table.created_at,
			table.id,
		),
		guildAiStatusCreatedIdx: pgIndex("idx_messages_guild_ai_status_created").on(
			table.guild_id,
			table.ai_status,
			table.created_at,
			table.id,
		),
		guildAiStatusAnalyzedIdx: pgIndex(
			"idx_messages_guild_ai_status_analyzed",
		).on(table.guild_id, table.ai_status, table.ai_analyzed_at, table.id),
		guildCreatedDeletedIdx: pgIndex("idx_messages_guild_created_deleted").on(
			table.guild_id,
			table.created_at,
			table.deleted_at,
			table.id,
		),
		channelAiStatusCreatedIdx: pgIndex(
			"idx_messages_channel_ai_status_created",
		).on(table.channel_id, table.ai_status, table.created_at, table.id),
		threadAiStatusCreatedIdx: pgIndex(
			"idx_messages_thread_ai_status_created",
		).on(table.thread_id, table.ai_status, table.created_at, table.id),
		// The claim is the only hot query in the system, and its predicate MUST
		// match `claim_messages()` exactly or Postgres cannot use this as an
		// index scan. Both are created by 0020.
		claimIdx: pgIndex("idx_messages_claim")
			.on(table.created_at)
			.where(
				sql`${table.ai_status} IN ('pending','retry_wait') AND ${table.deleted_at} IS NULL`,
			),
		leaseIdx: pgIndex("idx_messages_lease")
			.on(table.lease_until)
			.where(sql`${table.ai_status} = 'claimed'`),
	}),
)

export const messagesTable = pgMessagesTable

/**
 * Attachments Table (PostgreSQL)
 * Stores attachment metadata with upload status tracking
 */
export const pgAttachmentsTable = pgTable(
	"attachments",
	{
		id: pgText("id").primaryKey(),
		message_id: pgText("message_id").notNull(),
		guild_id: pgText("guild_id").notNull(),
		channel_id: pgText("channel_id").notNull(),
		thread_id: pgText("thread_id"),
		user_id: pgText("user_id").notNull(),
		filename: pgText("filename").notNull(),
		size: pgInteger("size").notNull(),
		type: pgText("type").notNull(),
		discord_url: pgText("discord_url").notNull(),
		uploaded_url: pgText("uploaded_url"),
		upload_status: pgText("upload_status", {
			enum: ["pending", "uploaded", "failed"],
		})
			.notNull()
			.default("pending"),
		upload_error: pgText("upload_error"),
		created_at: pgBigint("created_at", { mode: "number" }).notNull(),
		uploaded_at: pgBigint("uploaded_at", { mode: "number" }),
	},
	(table) => ({
		channelIdx: pgIndex("idx_attachments_channel").on(table.channel_id),
		messageIdx: pgIndex("idx_attachments_message").on(table.message_id),
		statusIdx: pgIndex("idx_attachments_status").on(table.upload_status),
		channelCreatedIdx: pgIndex("idx_attachments_channel_created").on(
			table.channel_id,
			table.created_at,
			table.id,
		),
		threadCreatedIdx: pgIndex("idx_attachments_thread_created").on(
			table.thread_id,
			table.created_at,
			table.id,
		),
		messageFk: pgForeignKey({
			columns: [table.message_id],
			foreignColumns: [pgMessagesTable.id],
			name: "fk_attachments_message_id",
		}).onDelete("cascade"),
	}),
)

export const attachmentsTable = pgAttachmentsTable

/**
 * Message Reviews Table (PostgreSQL)
 * Tracks manual reviews of messages flagged by AI moderation
 */
export const pgMessageReviewsTable = pgTable(
	"message_reviews",
	{
		id: pgText("id").primaryKey(),
		message_id: pgText("message_id").notNull(),
		guild_id: pgText("guild_id").notNull(),
		channel_id: pgText("channel_id").notNull(),
		reviewer_id: pgText("reviewer_id"),
		status: pgText("status", {
			enum: ["pending", "approved", "rejected", "escalated"],
		})
			.notNull()
			.default("pending"),
		notes: pgText("notes"),
		created_at: pgBigint("created_at", { mode: "number" }).notNull(),
		reviewed_at: pgBigint("reviewed_at", { mode: "number" }),
	},
	(table) => ({
		messageIdIdx: pgIndex("idx_message_reviews_message_id").on(
			table.message_id,
		),
		statusIdx: pgIndex("idx_message_reviews_status").on(table.status),
		createdAtIdx: pgIndex("idx_message_reviews_created_at").on(
			table.created_at,
		),
		guildStatusIdx: pgIndex("idx_message_reviews_guild_status").on(
			table.guild_id,
			table.status,
			table.created_at,
		),
	}),
)

export const messageReviewsTable = pgMessageReviewsTable

// =============================================================================
// AI Analysis / Analytics
// =============================================================================

/**
 * Verdicts Table (PostgreSQL)
 *
 * The model's judgement per message, keyed by message_id (so it is a to-one
 * relation from `messages`, and "no verdict" is a LEFT JOIN miss). Added to the
 * Drizzle schema in P1c — already live and already read through Prisma, but the
 * write path never needed a Drizzle definition of it.
 */
export const pgVerdictsTable = pgTable(
	"verdicts",
	{
		message_id: pgText("message_id").primaryKey(),
		status: pgText("status").notNull(),
		flags: pgText("flags").array().notNull(),
		categories: pgText("categories").array().notNull(),
		confidence: pgReal("confidence").notNull(),
		score: pgReal("score"),
		analysis: pgText("analysis").notNull(),
		evidence: pgJsonb("evidence").notNull(),
		policy_version: pgText("policy_version"),
		model: pgText("model"),
		duration_ms: pgInteger("duration_ms"),
		created_at: pgBigint("created_at", { mode: "number" }).notNull(),
		updated_at: pgBigint("updated_at", { mode: "number" }).notNull(),
		auto_delete_state: pgText("auto_delete_state"),
		auto_delete_claimed_at: pgBigint("auto_delete_claimed_at", {
			mode: "number",
		}),
		reason: pgText("reason"),
		action: pgText("action"),
	},
	(table) => ({
		statusIdx: pgIndex("idx_verdicts_status").on(table.status),
	}),
)

export const verdictsTable = pgVerdictsTable

/**
 * Analysis Attempts Table (PostgreSQL)
 *
 * Append-only record of every model call the worker makes, successful or not.
 * The moderation "coverage" panel reads this: it is the honest denominator for
 * attempt success rate. Added to the Drizzle schema in P1c — the table was
 * already live and already queried (through Prisma) but had no Drizzle
 * definition, because nothing on the write path needed one.
 */
export const pgAnalysisAttemptsTable = pgTable(
	"analysis_attempts",
	{
		id: pgBigint("id", { mode: "number" }).primaryKey(),
		message_id: pgText("message_id"),
		worker_id: pgText("worker_id"),
		attempt: pgInteger("attempt"),
		outcome: pgText("outcome"),
		error_code: pgText("error_code"),
		error_message: pgText("error_message"),
		duration_ms: pgInteger("duration_ms"),
		model: pgText("model"),
		prompt_tokens: pgInteger("prompt_tokens"),
		created_at: pgBigint("created_at", { mode: "number" }),
	},
	(table) => ({
		createdAtIdx: pgIndex("idx_analysis_attempts_created_at").on(
			table.created_at,
		),
	}),
)

export const analysisAttemptsTable = pgAnalysisAttemptsTable

/**
 * User Profiles Table (PostgreSQL)
 * Stores AI-generated summaries of user behavior patterns.
 *
 * ORPHANED READ PATH — no writer exists.
 *
 * `userProfileLearner.ts` / `userProfileStore.ts` were deleted by 2658b0dd
 * ("replace the moderation pipeline instead of layering onto it"), which
 * removed the six AI-moderation learner files but left their tables, the
 * repository reads and the dashboard panels behind. Nothing has written this
 * table since, so `users` shows no AI summary and `get_user_profile` always
 * returns `[]`.
 *
 * Kept rather than dropped because the read path is live (dashboard user
 * detail, `get_user_profile`) and the views degrade to an explicit empty
 * state. Rebuilding the producer is a product decision — it means choosing a
 * schedule and paying for a per-user summarisation call — not a bug fix.
 */
export const pgUserProfilesTable = pgTable(
	"user_profiles",
	{
		user_id: pgText("user_id").primaryKey(),
		guild_id: pgText("guild_id").notNull(),
		profile_summary: pgText("profile_summary").notNull(),
		last_analyzed_at: pgBigint("last_analyzed_at", {
			mode: "number",
		}).notNull(),
	},
	(table) => ({
		guildIdx: pgIndex("idx_user_profiles_guild_id").on(table.guild_id),
	}),
)

export const userProfilesTable = pgUserProfilesTable

/**
 * Channel Cultures Table (PostgreSQL)
 * Stores AI-generated summaries of channel norms and slang to inject as context.
 *
 * ORPHANED READ PATH — no writer exists. `cultureLearner.ts` and
 * `channelCultureStore.ts` were deleted by 2658b0dd along with the rest of the
 * v1 AI-moderation module, but the table, its reads (channels detail, the
 * glossary page) and the dashboard panel stayed. It is empty, so every channel
 * renders the explicit "No culture summary yet" state.
 *
 * Note this is NOT the channel context the moderator uses: that comes from
 * `messages.metadata` via `formatChannelContextForPrompt`, which is live.
 */
export const pgChannelCulturesTable = pgTable(
	"channel_cultures",
	{
		channel_id: pgText("channel_id").primaryKey(),
		guild_id: pgText("guild_id").notNull(),
		culture_summary: pgText("culture_summary").notNull(),
		last_analyzed_at: pgBigint("last_analyzed_at", {
			mode: "number",
		}).notNull(),
	},
	(table) => ({
		guildIdx: pgIndex("idx_channel_cultures_guild_id").on(table.guild_id),
	}),
)

export const channelCulturesTable = pgChannelCulturesTable

// =============================================================================
// Cache (text analysis + stickers)
// =============================================================================

/**
 * Term Glossary Cache Table (PostgreSQL)
 * Permanently stores resolved term definitions (Wikipedia/SearXNG lookups).
 * Definitions rarely change, so once a term is successfully resolved it is
 * persisted here forever — Redis/LRU only act as fast read caches in front.
 * Terms with NO definition (misses) are NOT stored here; they stay ephemeral
 * in Redis with a short TTL so transient lookup failures get retried.
 *
 * ORPHANED READ PATH — no writer exists. `termGlossary.ts` and
 * `termGlossaryStore.ts` (408 + 86 lines, including the SearXNG/Wikipedia
 * lookup and its prompt) were deleted by 2658b0dd with the rest of the v1
 * AI-moderation module. The `AI_DICTIONARY_*` env keys that drove them are
 * still provisioned, but no code reads them. The glossary page therefore
 * always renders an empty term list.
 */
export const pgTermGlossaryCacheTable = pgTable(
	"term_glossary_cache",
	{
		term: pgText("term").primaryKey(),
		definition: pgText("definition").notNull(),
		source_url: pgText("source_url").notNull().default(""),
		resolved_at: pgBigint("resolved_at", { mode: "number" }).notNull(),
		hit_count: pgInteger("hit_count").notNull().default(0),
	},
	(table) => ({
		resolvedAtIdx: pgIndex("idx_term_glossary_cache_resolved_at").on(
			table.resolved_at,
		),
	}),
)

export const termGlossaryCacheTable = pgTermGlossaryCacheTable

/**
 * Media Vision Cache Table (PostgreSQL)
 * Caches image/media descriptions across messages, channels, and restarts.
 */
export const pgMediaVisionCacheTable = pgTable(
	"media_vision_cache",
	{
		fingerprint: pgText("fingerprint").primaryKey(),
		description: pgText("description").notNull(),
		resolved_at: pgBigint("resolved_at", { mode: "number" }).notNull(),
		hit_count: pgInteger("hit_count").notNull().default(0),
	},
	(table) => ({
		resolvedAtIdx: pgIndex("idx_media_vision_cache_resolved_at").on(
			table.resolved_at,
		),
	}),
)

export const mediaVisionCacheTable = pgMediaVisionCacheTable
export type MediaVisionCache = typeof mediaVisionCacheTable.$inferSelect

// =============================================================================
// Meta / System
// =============================================================================

/**
 * UI State Table (PostgreSQL)
 * Stores persistent UI state (e.g., selected channel, filter preferences)
 */
export const pgUIStateTable = pgTable("ui_state", {
	key: pgText("key").primaryKey(),
	value: pgText("value").notNull(),
	updated_at: pgBigint("updated_at", { mode: "number" }).notNull(),
})

export const uiStateTable = pgUIStateTable

/**
 * Retention Policies Table (PostgreSQL)
 * Defines data retention rules per guild/channel
 */
export const pgRetentionPoliciesTable = pgTable(
	"retention_policies",
	{
		id: pgText("id").primaryKey(),
		guild_id: pgText("guild_id").notNull(),
		channel_id: pgText("channel_id"),
		retention_days: pgInteger("retention_days").notNull().default(90),
		apply_to_media: pgBoolean("apply_to_media").notNull().default(true),
		apply_to_voice: pgBoolean("apply_to_voice").notNull().default(true),
		enabled: pgBoolean("enabled").notNull().default(true),
		created_at: pgBigint("created_at", { mode: "number" }).notNull(),
		updated_at: pgBigint("updated_at", { mode: "number" }).notNull(),
	},
	(table) => ({
		guildIdIdx: pgIndex("idx_retention_policies_guild_id").on(table.guild_id),
		enabledIdx: pgIndex("idx_retention_policies_enabled").on(table.enabled),
	}),
)

export const retentionPoliciesTable = pgRetentionPoliciesTable

/**
 * Chatbot Messages Table (PostgreSQL)
 * Stores AI chat conversation history
 */
export const pgChatbotMessagesTable = pgTable(
	"chatbot_messages",
	{
		id: pgUuid("id").defaultRandom().primaryKey(),
		user_id: pgText("user_id").notNull(),
		user_message: pgText("user_message").notNull(),
		bot_response: pgText("bot_response").notNull(),
		context: pgJsonb("context").notNull().default("{}"),
		created_at: pgTimestamp("created_at", { withTimezone: true, mode: "date" })
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		userCreatedIdx: pgIndex("idx_chatbot_messages_user_created").on(
			table.user_id,
			table.created_at.desc(),
		),
	}),
)

export const chatbotMessagesTable = pgChatbotMessagesTable

// =============================================================================
// Type Exports
// =============================================================================

// Messages
export type Message = typeof messagesTable.$inferSelect
export type MessageInsert = typeof messagesTable.$inferInsert

// Attachments
export type Attachment = typeof attachmentsTable.$inferSelect
// =============================================================================
// Moderation Actions (gateway-local)
// =============================================================================

export const pgModerationActionsTable = pgTable(
	"moderation_actions",
	{
		id: pgText("id").primaryKey(),
		message_id: pgText("message_id"),
		user_id: pgText("user_id"),
		guild_id: pgText("guild_id").notNull(),
		action_type: pgText("action_type", {
			enum: ["delete_message", "reset_nickname"],
		}).notNull(),
		reason: pgText("reason"),
		executed_by: pgText("executed_by"),
		status: pgText("status", {
			enum: ["pending", "executed", "failed"],
		})
			.notNull()
			.default("pending"),
		error: pgText("error"),
		created_at: pgBigint("created_at", { mode: "number" }).notNull(),
		executed_at: pgBigint("executed_at", { mode: "number" }),
		// ── Explainability (structured verdict; surfaced read-only to public web) ──
		flags: pgText("flags"), // JSON array of string flags, e.g. ["sara_agama","vulgar"]
		categories: pgText("categories"), // JSON array of category strings
		confidence: pgReal("confidence"), // 0..1
		score: pgReal("score"), // 0..1 raw model score
		evidence: pgText("evidence"), // JSON array of short quoted snippets
		policy_version: pgText("policy_version"), // rules.ts policy version string
		username: pgText("username"), // denormalized from messages table for retention safety
		server_nick: pgText("server_nick"), // member's server-specific display name (nickname), from metadata.member.displayName
	},
	(table) => ({
		messageIdIdx: pgIndex("idx_moderation_actions_message_id").on(
			table.message_id,
		),
		userIdIdx: pgIndex("idx_moderation_actions_user_id").on(table.user_id),
		statusIdx: pgIndex("idx_moderation_actions_status").on(table.status),
		guildStatusIdx: pgIndex("idx_moderation_actions_guild_status").on(
			table.guild_id,
			table.status,
			table.created_at,
		),
	}),
)

export const moderationActionsTable = pgModerationActionsTable

// =============================================================================
// Message Edits (gateway-local)
// =============================================================================

export const pgMessageEditsTable = pgTable(
	"message_edits",
	{
		id: pgUuid("id").defaultRandom().primaryKey(),
		message_id: pgText("message_id").notNull(),
		old_content: pgText("old_content").notNull(),
		edited_at: pgBigint("edited_at", { mode: "number" }).notNull(),
	},
	(table) => ({
		messageIdIdx: pgIndex("idx_message_edits_message_id").on(table.message_id),
		editedAtIdx: pgIndex("idx_message_edits_edited_at").on(table.edited_at),
	}),
)

export const messageEditsTable = pgMessageEditsTable

// =============================================================================
// Reactions (gateway-local)
// =============================================================================

export const pgReactionsTable = pgTable(
	"message_reactions",
	{
		id: pgText("id").primaryKey(),
		message_id: pgText("message_id").notNull(),
		channel_id: pgText("channel_id").notNull(),
		guild_id: pgText("guild_id").notNull(),
		user_id: pgText("user_id").notNull(),
		username: pgText("username").notNull(),
		emoji: pgText("emoji").notNull(),
		emoji_id: pgText("emoji_id"),
		animated: pgBoolean("animated").notNull().default(false),
		reaction_type: pgText("reaction_type", {
			enum: ["add", "remove"],
		}).notNull(),
		created_at: pgBigint("created_at", { mode: "number" }).notNull(),
	},
	(table) => ({
		messageIdIdx: pgIndex("idx_reactions_message_id").on(table.message_id),
		userIdIdx: pgIndex("idx_reactions_user_id").on(table.user_id),
		guildCreatedIdx: pgIndex("idx_reactions_guild_created").on(
			table.guild_id,
			table.created_at,
		),
	}),
)

export const reactionsTable = pgReactionsTable
