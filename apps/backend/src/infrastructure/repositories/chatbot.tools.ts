import {
	and,
	count,
	countDistinct,
	desc,
	eq,
	gte,
	ilike,
	inArray,
	type SQL,
} from "drizzle-orm"
import { getDatabase } from "../database/drizzle.js"
import {
	channelCulturesTable,
	messageReviewsTable,
	messagesTable,
	userProfilesTable,
	verdictsTable,
} from "../database/schema.js"
import { createChildLogger } from "../logger/index.js"

/**
 * Executor for the chatbot's server-watcher tools. The tool *definitions*
 * live in chatbot.toolDefs.ts (no DB import); this file implements each one
 * against the real database.
 *
 * Every query goes through the Drizzle query builder with bound parameters, so
 * model-supplied arguments cannot inject SQL.
 */

const logger = createChildLogger("chatbot.tools")

/** Saturating counter of chatbot tool execution errors (for observability). */
export let toolErrors = 0
const TOOL_ERROR_CAP = 1000

function toolExecError(err: unknown, name: string): string {
	if (toolErrors < TOOL_ERROR_CAP) toolErrors++
	const detail = (err as Error)?.message ?? "unknown"
	logger.warn({ tool: name, error: detail }, "Chatbot tool execution failed")
	return `Tool ${name} gagal: ${detail}`
}

/**
 * Read an id argument, whatever shape the model used.
 *
 * `userId` used to be read with `typeof args.userId === "string"` only, so a
 * model that wrote the snowflake as a NUMBER produced `undefined` — and
 * `userMessages(undefined, …)` then queried the whole guild instead of one
 * user, answering a question nobody asked. A number, a numeric string and a
 * quoted id all address the same member, so all three are accepted.
 */
export function readIdArg(value: unknown): string | undefined {
	if (typeof value === "string") {
		const trimmed = value.trim().replace(/^["'`]+|["'`]+$/g, "")
		return trimmed.length > 0 ? trimmed : undefined
	}
	if (typeof value === "number" && Number.isFinite(value)) return String(value)
	return undefined
}

/**
 * Read a free-text query argument.
 *
 * The plural spelling is accepted because models ask for several terms at once:
 * `{"queries":["judi","togel"]}` reached the old code as an absent `query`, the
 * tool searched for the EMPTY string, and the model then reported the resulting
 * flood of rows as if it had searched for something.
 */
export function readQueryArg(args: Record<string, unknown>): string {
	const single = args.query ?? args.q ?? args.keyword ?? args.search
	if (typeof single === "string" && single.trim().length > 0) {
		return single.trim()
	}
	const many = args.queries ?? args.keywords ?? args.terms
	if (Array.isArray(many)) {
		const parts = many
			.map((v) => (typeof v === "string" ? v.trim() : ""))
			.filter((v) => v.length > 0)
		if (parts.length > 0) return parts.join(" ")
	}
	if (typeof many === "string" && many.trim().length > 0) {
		// `"judi, togel"` or `'["judi","togel"]'` — either way the words are the
		// terms the model wanted searched.
		return many
			.replace(/^\[|\]$/g, "")
			.split(/[,;]+/)
			.map((v) => v.trim().replace(/^["'`]+|["'`]+$/g, ""))
			.filter((v) => v.length > 0)
			.join(" ")
	}
	return ""
}

/** Executes a tool call against the real DB and returns a readable result. */
export async function executeTool(
	name: string,
	args: Record<string, unknown>,
): Promise<string> {
	const guildId = readIdArg(args.guildId)
	const channelId = readIdArg(args.channelId)
	const userId = readIdArg(args.userId ?? args.user_id ?? args.memberId)
	const limitRaw =
		typeof args.limit === "number" ? args.limit : Number(args.limit) || 5
	const limit = Math.min(Math.max(1, Math.round(limitRaw)), 20)

	try {
		switch (name) {
			case "get_server_stats":
				return await serverStats(guildId, channelId)
			case "get_top_channels":
				return await topChannels(guildId, limit)
			case "get_recent_activity":
				return await recentActivity(guildId, channelId, limit)
			case "get_top_flagged":
				return await topFlagged(guildId, channelId, limit)
			case "search_messages":
				return await searchMessages(
					readQueryArg(args),
					guildId,
					channelId,
					limit,
				)
			case "get_user_messages":
				return await userMessages(userId, guildId, channelId, limit)
			case "get_user_profile":
				return await userProfile(userId, guildId)
			case "get_user_reputation":
				return await userReputation(userId, guildId)
			case "get_channel_culture":
				return await channelCulture(
					typeof args.channelId === "string" ? args.channelId : undefined,
				)
			case "get_message_detail":
				return await messageDetail(
					typeof args.messageId === "string" ? args.messageId : undefined,
				)
			case "get_message_reviews":
				return await messageReviews(
					guildId,
					typeof args.status === "string" ? args.status : undefined,
					limit,
				)
			case "get_moderation_timeline":
				return await moderationTimeline(
					guildId,
					channelId,
					typeof args.days === "number"
						? Math.min(Math.max(1, args.days), 60)
						: 14,
				)
			default:
				return `Unknown tool: ${name}`
		}
	} catch (error) {
		// Best-effort: if a tool fails, return readable error instead of crashing
		return toolExecError(error, name)
	}
}

// ── Query helpers ──────────────────────────────────────────

/**
 * The guild/channel scope shared by most message tools.
 *
 * Was a Prisma `where` object literal; now a list of Drizzle conditions that
 * the caller folds into `and(...)`. An absent scope yields an empty list, and
 * `and()` of nothing is `undefined` — which Drizzle treats as "no filter", the
 * same as Prisma's `{}`.
 */
function scopeMessages(guildId?: string, channelId?: string): SQL[] {
	const conditions: SQL[] = []
	if (guildId) conditions.push(eq(messagesTable.guild_id, guildId))
	if (channelId) conditions.push(eq(messagesTable.channel_id, channelId))
	return conditions
}

// ── Tool executors ──────────────────────────────────────────

async function serverStats(
	guildId?: string,
	channelId?: string,
): Promise<string> {
	const db = getDatabase()
	const scope = scopeMessages(guildId, channelId)

	// The verdict counts join through `messages` because the scope is stated in
	// message columns (guild_id/channel_id) and `verdicts` carries neither.
	const verdictScope = (status: "deleted" | "clean") =>
		and(
			eq(verdictsTable.status, status),
			inArray(
				verdictsTable.message_id,
				db
					.select({ id: messagesTable.id })
					.from(messagesTable)
					.where(and(...scope)),
			),
		)

	const [totalRows, activeRows, flaggedRows, cleanRows] = await Promise.all([
		db
			.select({ n: count() })
			.from(messagesTable)
			.where(and(...scope)),
		// `distinct: ["user_id"]` becomes COUNT(DISTINCT …) rather than a fetch of
		// unique rows — same number, one value instead of N.
		db
			.select({ n: countDistinct(messagesTable.user_id) })
			.from(messagesTable)
			.where(and(...scope)),
		db
			.select({ n: count() })
			.from(verdictsTable)
			.where(verdictScope("deleted")),
		db.select({ n: count() }).from(verdictsTable).where(verdictScope("clean")),
	])

	return JSON.stringify({
		total_messages: totalRows[0]?.n ?? 0,
		active_users: activeRows[0]?.n ?? 0,
		flagged: flaggedRows[0]?.n ?? 0,
		clean: cleanRows[0]?.n ?? 0,
	})
}

async function topChannels(guildId?: string, limit = 5): Promise<string> {
	const db = getDatabase()
	const rows = await db
		.select({ channel_id: messagesTable.channel_id, n: count() })
		.from(messagesTable)
		.where(and(...scopeMessages(guildId)))
		.groupBy(messagesTable.channel_id)
		// `orderBy: {_count: {channel_id: "desc"}}` ranked by the grouped count.
		.orderBy(desc(count()))
		.limit(limit)
	return JSON.stringify(
		rows.map((r) => ({ channel_id: r.channel_id, count: r.n })),
	)
}

async function recentActivity(
	guildId?: string,
	channelId?: string,
	limit = 5,
): Promise<string> {
	const db = getDatabase()
	const rows = await db
		.select({
			id: messagesTable.id,
			username: messagesTable.username,
			user_id: messagesTable.user_id,
			channel_id: messagesTable.channel_id,
			content: messagesTable.content,
			created_at: messagesTable.created_at,
			ai_status: messagesTable.ai_status,
		})
		.from(messagesTable)
		.where(and(...scopeMessages(guildId, channelId)))
		.orderBy(desc(messagesTable.created_at))
		.limit(limit)
	return JSON.stringify(rows)
}

async function topFlagged(
	guildId?: string,
	channelId?: string,
	limit = 5,
): Promise<string> {
	const db = getDatabase()
	// Prisma selected a nested `messages { … }` relation off each verdict. There
	// is no Drizzle equivalent, so this is an explicit inner join — safe because
	// `verdicts.message_id` is the PK of a to-one relation, so a deleted verdict
	// without a message row cannot exist.
	//
	// The verdict columns are aliased `verdict_*` in the SELECT because the JSON
	// handed to the model keeps both the message fields and the judgement, and
	// `status` exists on only one side here.
	const rows = await db
		.select({
			id: messagesTable.id,
			username: messagesTable.username,
			channel_id: messagesTable.channel_id,
			content: messagesTable.content,
			// Pipeline position — NOT the judgement. Kept so the chatbot can report
			// "still pending" honestly.
			ai_status: messagesTable.ai_status,
			created_at: messagesTable.created_at,
			verdict_status: verdictsTable.status,
			verdict_flags: verdictsTable.flags,
			verdict_analysis: verdictsTable.analysis,
			verdict_score: verdictsTable.score,
		})
		.from(verdictsTable)
		.innerJoin(messagesTable, eq(verdictsTable.message_id, messagesTable.id))
		.where(
			and(
				eq(verdictsTable.status, "deleted"),
				...scopeMessages(guildId, channelId),
			),
		)
		// Ranked by the decision, then by how hard the model judged it. `score` is
		// a number, so this is a real ranking and not a lexical sort.
		.orderBy(desc(verdictsTable.score), desc(messagesTable.created_at))
		.limit(limit)

	return JSON.stringify(rows)
}

async function searchMessages(
	query: string,
	guildId?: string,
	channelId?: string,
	limit = 5,
): Promise<string> {
	const db = getDatabase()
	if (!query.trim()) return JSON.stringify({ error: "query kosong" })
	const rows = await db
		.select({
			id: messagesTable.id,
			username: messagesTable.username,
			channel_id: messagesTable.channel_id,
			content: messagesTable.content,
			created_at: messagesTable.created_at,
			ai_status: messagesTable.ai_status,
		})
		.from(messagesTable)
		.where(
			and(
				ilike(messagesTable.content, `%${query}%`),
				...scopeMessages(guildId, channelId),
			),
		)
		.orderBy(desc(messagesTable.created_at))
		.limit(limit)
	return JSON.stringify(rows)
}

async function userMessages(
	userId?: string,
	guildId?: string,
	channelId?: string,
	limit = 10,
): Promise<string> {
	const db = getDatabase()
	if (!userId) return JSON.stringify({ error: "userId wajib" })
	const rows = await db
		.select({
			id: messagesTable.id,
			channel_id: messagesTable.channel_id,
			content: messagesTable.content,
			created_at: messagesTable.created_at,
			ai_status: messagesTable.ai_status,
		})
		.from(messagesTable)
		.where(
			and(
				eq(messagesTable.user_id, userId),
				...scopeMessages(guildId, channelId),
			),
		)
		.orderBy(desc(messagesTable.created_at))
		.limit(limit)
	return JSON.stringify(rows)
}

async function userProfile(userId?: string, guildId?: string): Promise<string> {
	const db = getDatabase()
	if (!userId) return JSON.stringify({ error: "userId wajib" })
	const rows = await db
		.select({
			user_id: userProfilesTable.user_id,
			guild_id: userProfilesTable.guild_id,
			profile_summary: userProfilesTable.profile_summary,
			last_analyzed_at: userProfilesTable.last_analyzed_at,
		})
		.from(userProfilesTable)
		.where(
			guildId
				? and(
						eq(userProfilesTable.user_id, userId),
						eq(userProfilesTable.guild_id, guildId),
					)
				: eq(userProfilesTable.user_id, userId),
		)
		.limit(1)
	return JSON.stringify(rows[0] ?? { error: "profil tidak ditemukan" })
}

async function userReputation(
	_userId?: string,
	_guildId?: string,
): Promise<string> {
	// The per-user reputation feature (trust scores, streaks, infractions) was
	// removed from the gateway (migration 0016 drops user_reputations). Return
	// an honest "unavailable" answer from the derived moderation signals instead
	// of querying the now-dropped table.
	return JSON.stringify({
		available: false,
		message:
			"Skor trust/skala reputasi per-user telah dihapus dari sistem. Gunakan rasio pesan ter-flag vs total untuk menilai risiko (lihat dashboard Users).",
	})
}

async function channelCulture(channelId?: string): Promise<string> {
	const db = getDatabase()
	if (!channelId) return JSON.stringify({ error: "channelId wajib" })
	const rows = await db
		.select({
			channel_id: channelCulturesTable.channel_id,
			culture_summary: channelCulturesTable.culture_summary,
			last_analyzed_at: channelCulturesTable.last_analyzed_at,
		})
		.from(channelCulturesTable)
		.where(eq(channelCulturesTable.channel_id, channelId))
		.limit(1)
	return JSON.stringify(rows[0] ?? { error: "culture tidak ditemukan" })
}

async function messageDetail(messageId?: string): Promise<string> {
	const db = getDatabase()
	if (!messageId) return JSON.stringify({ error: "messageId wajib" })
	const rows = await db
		.select({
			id: messagesTable.id,
			guild_id: messagesTable.guild_id,
			channel_id: messagesTable.channel_id,
			user_id: messagesTable.user_id,
			username: messagesTable.username,
			content: messagesTable.content,
			created_at: messagesTable.created_at,
			ai_status: messagesTable.ai_status,
			ai_moderation_flags: messagesTable.ai_moderation_flags,
			ai_moderation_score: messagesTable.ai_moderation_score,
			ai_categories: messagesTable.ai_categories,
			ai_analysis: messagesTable.ai_analysis,
			ai_confidence: messagesTable.ai_confidence,
		})
		.from(messagesTable)
		.where(eq(messagesTable.id, messageId))
		.limit(1)
	return JSON.stringify(rows[0] ?? { error: "pesan tidak ditemukan" })
}

async function messageReviews(
	guildId?: string,
	status?: string,
	limit = 10,
): Promise<string> {
	const db = getDatabase()
	const conditions: SQL[] = []
	if (guildId) conditions.push(eq(messageReviewsTable.guild_id, guildId))
	if (status) {
		conditions.push(
			eq(
				messageReviewsTable.status,
				status as "pending" | "approved" | "rejected",
			),
		)
	}
	const rows = await db
		.select({
			id: messageReviewsTable.id,
			message_id: messageReviewsTable.message_id,
			reviewer_id: messageReviewsTable.reviewer_id,
			status: messageReviewsTable.status,
			notes: messageReviewsTable.notes,
			created_at: messageReviewsTable.created_at,
			reviewed_at: messageReviewsTable.reviewed_at,
		})
		.from(messageReviewsTable)
		.where(and(...conditions))
		.orderBy(desc(messageReviewsTable.created_at))
		.limit(limit)
	return JSON.stringify(rows)
}

async function moderationTimeline(
	guildId?: string,
	channelId?: string,
	days = 14,
): Promise<string> {
	const db = getDatabase()
	const since = Date.now() - days * 24 * 60 * 60 * 1000

	// LEFT JOIN, not inner: an unjudged message still counts toward the day's
	// total, it just contributes no flagged/clean. Prisma's nested
	// `verdicts: {select}` was exactly this semantics.
	const rows = await db
		.select({
			created_at: messagesTable.created_at,
			verdict_status: verdictsTable.status,
		})
		.from(messagesTable)
		.leftJoin(verdictsTable, eq(verdictsTable.message_id, messagesTable.id))
		.where(
			and(
				...scopeMessages(guildId, channelId),
				gte(messagesTable.created_at, since),
			),
		)

	// Bucketed in JS rather than with date_trunc: the builder has no time-bucket
	// expression, and grouping here keeps the result identical to the SQL it
	// replaces without approximating the date format.
	const byDay = new Map<
		string,
		{ total: number; flagged: number; clean: number }
	>()
	for (const r of rows) {
		const day = new Date(Number(r.created_at)).toISOString().slice(0, 10)
		const bucket = byDay.get(day) ?? { total: 0, flagged: 0, clean: 0 }
		bucket.total += 1
		if (r.verdict_status === "deleted") bucket.flagged += 1
		if (r.verdict_status === "clean") bucket.clean += 1
		byDay.set(day, bucket)
	}

	return JSON.stringify(
		[...byDay.entries()]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([day, v]) => ({ day, ...v })),
	)
}
