import {
	and,
	asc,
	desc,
	eq,
	exists,
	isNull,
	lt,
	notInArray,
	or,
	type SQL,
	sql,
} from "drizzle-orm"
import type {
	MessageCreate,
	MessageQuery,
	MessageUpdate,
} from "../../domain/messages/message-contracts.js"
import { readChannelName } from "../../domain/utils/channelName.js"
import { mapMessageRow } from "../../domain/utils/messageMapper.js"
import { encodeCursor } from "../../domain/utils/pagination.js"
import { config } from "../config/index.js"
import { buildCursorCondition } from "../database/cursor.js"
import type { DatabaseHandle } from "../database/handle.js"
import {
	analysisAttemptsTable,
	attachmentsTable,
	messageEditsTable,
	messagesTable,
	verdictsTable,
} from "../database/schema.js"
import { createChildLogger } from "../logger/index.js"
import type { PageResult } from "../shared-barrel/index.js"

/**
 * Thread/channel IDs to exclude from all message queries.
 * Messages in these threads (e.g. bot/selfbot spam) are skipped
 * both at capture time and when serving data
 * (backend API). Configured via EXCLUDED_THREAD_IDS and EXCLUDED_CHANNEL_IDS.
 */
const EXCLUDED_THREAD_IDS = config.EXCLUDED_THREAD_IDS

const logger = createChildLogger("messages.repository")

/** Full message projection, shared by list, detail, and review queries. */
const messageColumns = {
	id: messagesTable.id,
	guild_id: messagesTable.guild_id,
	channel_id: messagesTable.channel_id,
	thread_id: messagesTable.thread_id,
	user_id: messagesTable.user_id,
	username: messagesTable.username,
	avatar_url: messagesTable.avatar_url,
	content: messagesTable.content,
	edited_content: messagesTable.edited_content,
	created_at: messagesTable.created_at,
	edited_at: messagesTable.edited_at,
	deleted_at: messagesTable.deleted_at,
	type: messagesTable.type,
	metadata: messagesTable.metadata,
	ai_status: messagesTable.ai_status,
	attempts: messagesTable.attempts,
	worker_id: messagesTable.worker_id,
	lease_until: messagesTable.lease_until,
	ready_for_work_at: messagesTable.ready_for_work_at,
	ai_moderation_flags: messagesTable.ai_moderation_flags,
	ai_moderation_score: messagesTable.ai_moderation_score,
	ai_analysis: messagesTable.ai_analysis,
	ai_categories: messagesTable.ai_categories,
	ai_confidence: messagesTable.ai_confidence,
	ai_analyzed_at: messagesTable.ai_analyzed_at,
	ai_analysis_duration_ms: messagesTable.ai_analysis_duration_ms,
	ai_error: messagesTable.ai_error,
	is_reply: messagesTable.is_reply,
	is_forward: messagesTable.is_forward,
	is_crosspost: messagesTable.is_crosspost,
	reference_message_id: messagesTable.reference_message_id,
	reference_channel_id: messagesTable.reference_channel_id,
	reference_guild_id: messagesTable.reference_guild_id,
} as const

/** Flat aliases consumed by mapMessageRow; missing LEFT JOIN values stay null. */
const verdictColumns = {
	verdict_status: verdictsTable.status,
	verdict_score: verdictsTable.score,
	verdict_confidence: verdictsTable.confidence,
	verdict_flags: verdictsTable.flags,
	verdict_categories: verdictsTable.categories,
	verdict_reason: verdictsTable.reason,
	verdict_analysis: verdictsTable.analysis,
	verdict_evidence: verdictsTable.evidence,
	verdict_model: verdictsTable.model,
	verdict_updated_at: verdictsTable.updated_at,
	auto_delete_state: verdictsTable.auto_delete_state,
} as const

/**
 * The full message projection: every message column plus the flattened verdict.
 *
 * LEFT JOIN, deliberately. An INNER join would silently hide every unanalysed
 * message from the dashboard — including anything still queued, or analysed by
 * the old pipeline before the rewrite.
 */
const messageWithVerdict = { ...messageColumns, ...verdictColumns }

export interface AttachmentResult {
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
	upload_status: string
	upload_error: string | null
	created_at: number
	uploaded_at: number | null
}

type MessageRow = ReturnType<typeof mapMessageRow>

export type { MessageRow }

/**
 * Build the NULL-safe "exclude spam threads" condition. Non-thread messages
 * (NULL thread_id) are always kept; thread messages are kept only when their
 * thread is not in the configured exclusion list.
 */
function excludeSpamThreads(): SQL | undefined {
	if (EXCLUDED_THREAD_IDS.length === 0) return undefined
	return or(
		isNull(messagesTable.thread_id),
		notInArray(messagesTable.thread_id, EXCLUDED_THREAD_IDS),
	)
}

/** Normalize a raw attachment DB row to the API shape. */
function mapAttachmentRow(r: Record<string, unknown>): AttachmentResult {
	return {
		id: String(r.id ?? ""),
		message_id: String(r.message_id ?? ""),
		guild_id: String(r.guild_id ?? ""),
		channel_id: String(r.channel_id ?? ""),
		thread_id: (r.thread_id as string | null) ?? null,
		user_id: String(r.user_id ?? ""),
		filename: String(r.filename ?? ""),
		size: Number(r.size ?? 0),
		type: String(r.type ?? ""),
		discord_url: String(r.discord_url ?? ""),
		uploaded_url: (r.uploaded_url as string | null) ?? null,
		upload_status: String(r.upload_status ?? "pending"),
		upload_error: (r.upload_error as string | null) ?? null,
		created_at: Number(r.created_at ?? 0),
		uploaded_at: r.uploaded_at == null ? null : Number(r.uploaded_at),
	}
}

/** Select the first `limit + 1` rows so the caller can derive the next cursor. */
function cursorLimit(limit: number): number {
	return limit + 1
}

/** Resume after the last returned row, including id to preserve timestamp ties. */
function nextCursorAt<T extends { created_at: number; id: string }>(
	rows: T[],
	limit: number,
): string | null {
	if (rows.length <= limit) return null
	return encodeCursor(rows[limit - 1])
}

// Reuse these exact expressions for sorting, cursor filtering, and encoding.
// Widen float4 before multiplying so Postgres and JS cursor values agree.
const reviewActionRank = sql<number>`CASE ${verdictsTable.status} WHEN 'deleted' THEN 2 WHEN 'clean' THEN 1 ELSE 0 END`
const reviewScoreRank = sql<number>`FLOOR(COALESCE(${verdictsTable.score}::double precision, 0) * 100)`

/**
 * A position in the review queue, resolved to the raw column values a row
 * comparison needs.
 *
 * Deliberately stores the RANK (`2` for deleted), not the string, so the decode
 * side needs no CASE of its own — the same numbering is used on both sides of
 * the comparison, which is the whole point of the encoding.
 */
interface ReviewCursor {
	action: number
	score: number
	created_at: number
	id: string
}

/** Encode/decode are lenient on purpose: a malformed cursor means "first page". */
function decodeReviewCursor(cursor?: string): ReviewCursor | null {
	if (!cursor) return null
	try {
		const raw = JSON.parse(
			Buffer.from(cursor, "base64").toString("utf-8"),
		) as Partial<ReviewCursor>
		if (
			typeof raw.action !== "number" ||
			!Number.isFinite(raw.action) ||
			typeof raw.score !== "number" ||
			!Number.isFinite(raw.score) ||
			typeof raw.created_at !== "number" ||
			!Number.isFinite(raw.created_at) ||
			typeof raw.id !== "string"
		) {
			return null
		}
		return {
			action: raw.action,
			score: raw.score,
			created_at: raw.created_at,
			id: raw.id,
		}
	} catch {
		return null
	}
}

function encodeReviewCursor(cursor: ReviewCursor): string {
	return Buffer.from(JSON.stringify(cursor)).toString("base64")
}

/**
 * A page of enforcement-log rows plus the position to resume from.
 *
 * `results` is `MappedMessage[]`, the same shape `findMany` returns — not a
 * loose `Record<string, unknown>[]`. It was declared loosely because the rows
 * used to skip `mapMessageRow` entirely and go out as raw Prisma values, BigInt
 * columns included. Now that they are mapped, the loose type is a lie that also
 * hides every field from the compiler; `MessageRow` is the type consumers
 * already handle.
 */
export interface ReviewPageResult {
	results: MessageRow[]
	nextCursor: string | null
}

/** A position in the edit log: `(edited_at, id)`, both needed for a total order. */
interface EditCursor {
	edited_at: number
	id: string
}

/** A page of edit rows plus the position to resume from. */
export interface EditPageResult {
	results: {
		id: string
		message_id: string
		old_content: string
		new_content: string
		edited_at: number
		channel_id: string | null
		channel_name: string | null
		username: string | null
	}[]
	nextCursor: string | null
}

/** A malformed cursor degrades to "no cursor" — the first page — never to a throw. */
function decodeEditCursor(cursor?: string): EditCursor | null {
	if (!cursor) return null
	try {
		const raw = JSON.parse(
			Buffer.from(cursor, "base64").toString("utf-8"),
		) as Partial<EditCursor>
		if (
			typeof raw.edited_at !== "number" ||
			!Number.isFinite(raw.edited_at) ||
			typeof raw.id !== "string"
		) {
			return null
		}
		return { edited_at: raw.edited_at, id: raw.id }
	} catch {
		return null
	}
}

function encodeEditCursor(cursor: EditCursor): string {
	return Buffer.from(JSON.stringify(cursor)).toString("base64")
}

/**
 * A condition on the message's verdict status.
 *
 * Prisma spelled this `{verdicts: {is: {status}}}`, which it compiles to an
 * EXISTS. An explicit EXISTS keeps that exact semantics — importantly it does
 * NOT become a join, so a message is not duplicated by a one-to-many.
 */
function hasVerdictStatus(status: string): SQL {
	return sql`EXISTS (SELECT 1 FROM ${verdictsTable} v WHERE v.message_id = ${messagesTable.id} AND v.status = ${status})`
}

/**
 * `or()` / `and()` without the `| undefined`.
 *
 * Drizzle types both as possibly-undefined because an EMPTY argument list has
 * no predicate to emit. Every call in this file passes at least one known-good
 * condition, so that branch is unreachable — and asserting it once here beats a
 * non-null assertion at each of the dozen call sites, with a comment explaining
 * why each one is safe.
 */
function anyOf(...conditions: SQL[]): SQL {
	return or(...conditions) as SQL
}

function allOf(...conditions: SQL[]): SQL {
	return and(...conditions) as SQL
}

/**
 * The enum unions for `messages.ai_status` and `messages.type`.
 *
 * Derived from the schema rather than re-declared: the Drizzle column carries
 * the pg-enum union, so a filter built from these types is checked against the
 * database definition at compile time. A hand-written copy would drift the
 * moment a status is added.
 */
type MessageAiStatus = NonNullable<
	(typeof messagesTable.$inferSelect)["ai_status"]
>
type MessageType = NonNullable<(typeof messagesTable.$inferSelect)["type"]>

/**
 * The `MessageQuery` filters that every message listing shares: guild, channel,
 * author, and pipeline status.
 */
function baseMessageFilters(query: MessageQuery): SQL[] {
	const conditions: SQL[] = []
	if (query.guildId) {
		conditions.push(eq(messagesTable.guild_id, query.guildId))
	}
	if (query.channelId) {
		conditions.push(eq(messagesTable.channel_id, query.channelId))
	}
	if (query.userId) {
		conditions.push(eq(messagesTable.user_id, query.userId))
	}
	if (query.status) {
		// Pipeline position, e.g. `dead`.
		conditions.push(
			eq(messagesTable.ai_status, query.status as MessageAiStatus),
		)
	}
	if (query.verdict) {
		// Moderation outcome. Filtering on messages.ai_status here would return
		// nothing at all, because the worker only ever writes `analyzed` to it.
		conditions.push(hasVerdictStatus(query.verdict))
	}
	if (query.needsReview) {
		conditions.push(hasVerdictStatus("deleted"))
	}

	return conditions
}

/**
 * Add the paging concerns to a filter list: the `created_at` resume cursor and
 * the spam-thread exclusion (NULL-safe: non-thread messages are kept).
 */
function withPaging(conditions: SQL[], cursor?: string): SQL[] {
	const paged = [...conditions]
	const after = buildCursorCondition(
		messagesTable.created_at,
		messagesTable.id,
		cursor,
	)
	if (after) paged.push(after)
	const excludeThreads = excludeSpamThreads()
	if (excludeThreads) paged.push(excludeThreads)
	return paged
}

export class MessagesRepository {
	constructor(private readonly db: DatabaseHandle) {}

	/**
	 * One `limit + 1` page of messages with their joined verdict, newest first.
	 * The extra row is how callers detect whether another page exists.
	 */
	private selectMessagePage(conditions: SQL[], limit: number) {
		return this.db
			.select(messageWithVerdict)
			.from(messagesTable)
			.leftJoin(verdictsTable, eq(verdictsTable.message_id, messagesTable.id))
			.where(and(...conditions))
			.orderBy(desc(messagesTable.created_at), desc(messagesTable.id))
			.limit(cursorLimit(limit))
	}

	async findMany(query: MessageQuery): Promise<PageResult<MessageRow>> {
		const limit = query.limit ?? 50
		const conditions = baseMessageFilters(query)

		const rows = await this.selectMessagePage(
			withPaging(conditions, query.cursor),
			limit,
		)

		const data = rows.slice(0, limit).map((r) => mapMessageRow(r))
		const nextCursor = nextCursorAt(rows, limit)

		logger.debug({ count: data.length, nextCursor }, "Found messages")
		return { data, nextCursor }
	}

	/**
	 * One message with its joined verdict.
	 *
	 * Left-joined like the list query: most messages have no verdict, and an
	 * inner join here would make the detail view 404 on anything unjudged.
	 */
	async findById(id: string) {
		const [row] = await this.db
			.select(messageWithVerdict)
			.from(messagesTable)
			.leftJoin(verdictsTable, eq(verdictsTable.message_id, messagesTable.id))
			.where(eq(messagesTable.id, id))
			.limit(1)

		if (!row) return null
		return mapMessageRow(row)
	}

	/**
	 * Every analysis attempt for a message, oldest first.
	 *
	 * This is the only way to answer "why is this one message stuck?" — the
	 * verdict table cannot, because a message that never got a verdict has no row
	 * there at all. Append-only, so it is a complete history of what the worker
	 * tried and what came back.
	 */
	async getAnalysisAttempts(messageId: string): Promise<
		Array<{
			attempt: number
			outcome: string
			error_code: string | null
			error_message: string | null
			duration_ms: number | null
			model: string | null
			worker_id: string | null
			prompt_tokens: number | null
			created_at: number
		}>
	> {
		const rows = await this.db
			.select({
				attempt: analysisAttemptsTable.attempt,
				outcome: analysisAttemptsTable.outcome,
				error_code: analysisAttemptsTable.error_code,
				error_message: analysisAttemptsTable.error_message,
				duration_ms: analysisAttemptsTable.duration_ms,
				model: analysisAttemptsTable.model,
				worker_id: analysisAttemptsTable.worker_id,
				prompt_tokens: analysisAttemptsTable.prompt_tokens,
				created_at: analysisAttemptsTable.created_at,
			})
			.from(analysisAttemptsTable)
			.where(eq(analysisAttemptsTable.message_id, messageId))
			.orderBy(
				asc(analysisAttemptsTable.created_at),
				asc(analysisAttemptsTable.id),
			)
		return rows.map((r) => ({
			attempt: Number(r.attempt),
			outcome: String(r.outcome),
			error_code: r.error_code ?? null,
			error_message: r.error_message ?? null,
			duration_ms: r.duration_ms === null ? null : Number(r.duration_ms),
			model: r.model ?? null,
			worker_id: r.worker_id ?? null,
			prompt_tokens: r.prompt_tokens === null ? null : Number(r.prompt_tokens),
			created_at: Number(r.created_at),
		}))
	}

	/**
	 * Edit history for a message: previous content snapshots (newest first).
	 * Stored in message_edits by the gateway's message-capture module.
	 */
	async getEditHistory(
		messageId: string,
	): Promise<Array<{ old_content: string; edited_at: number }>> {
		const rows = await this.db
			.select({
				old_content: messageEditsTable.old_content,
				edited_at: messageEditsTable.edited_at,
			})
			.from(messageEditsTable)
			.where(eq(messageEditsTable.message_id, messageId))
			.orderBy(desc(messageEditsTable.edited_at))
			.limit(50)
		return rows.map((r) => ({
			old_content: String(r.old_content ?? ""),
			edited_at: Number(r.edited_at ?? 0),
		}))
	}

	async findByChannel(
		channelId: string,
		query: MessageQuery,
	): Promise<PageResult<MessageRow>> {
		return this.findMany({ ...query, channelId })
	}

	/**
	 * Async generator that yields messages ONE AT A TIME for WS streaming.
	 * Each `.next()` runs its own bounded DB query (limit+1) advancing on the
	 * `created_at` cursor, so memory stays flat and the caller can emit one WS
	 * frame per message (no 50-row batch). Stops when a page returns < limit.
	 */
	async *streamMany(
		query: MessageQuery,
		pageSize = 50,
	): AsyncGenerator<MessageRow, void, unknown> {
		const conditions = baseMessageFilters(query)

		let cursor: string | undefined = query.cursor

		while (true) {
			const rows = await this.selectMessagePage(
				withPaging(conditions, cursor),
				pageSize,
			)

			if (rows.length === 0) return

			const hasMore = rows.length > pageSize
			const pageRows = hasMore ? rows.slice(0, pageSize) : rows

			for (const r of pageRows) {
				yield mapMessageRow(r)
			}

			if (!hasMore) return
			cursor = encodeCursor(rows[pageSize - 1])
		}
	}

	async create(data: MessageCreate) {
		const id = crypto.randomUUID()

		const [row] = await this.db
			.insert(messagesTable)
			.values({
				id,
				guild_id: data.guildId,
				channel_id: data.channelId,
				thread_id: data.threadId ?? null,
				user_id: data.userId,
				username: data.username,
				avatar_url: data.avatarUrl ?? null,
				content: data.content,
				edited_content: null,
				created_at: Date.now(),
				edited_at: null,
				deleted_at: null,
				type: (data.type ?? "text") as MessageType,
				metadata: null,
				ai_status: "pending",
				is_reply: data.isReply ?? false,
				is_forward: data.isForward ?? false,
				is_crosspost: data.isCrosspost ?? false,
				reference_message_id: data.referenceMessageId ?? null,
				reference_channel_id: data.referenceChannelId ?? null,
				reference_guild_id: data.referenceGuildId ?? null,
			})
			// A freshly created message has no verdict yet, but the returning select
			// is the full projection so `create` returns the same shape as
			// `findById` without a second round trip.
			.returning(messageColumns)

		return mapMessageRow(row)
	}

	async update(id: string, data: MessageUpdate) {
		const setData: Partial<typeof messagesTable.$inferInsert> = {}

		if (data.editedContent !== undefined) {
			setData.edited_content = data.editedContent
		}
		if (data.aiStatus !== undefined) {
			setData.ai_status = data.aiStatus as MessageAiStatus
		}
		if (data.aiAnalysis !== undefined) {
			setData.ai_analysis = data.aiAnalysis
		}
		if (data.aiCategories !== undefined) {
			setData.ai_categories = data.aiCategories
		}
		if (data.aiConfidence !== undefined) {
			setData.ai_confidence = data.aiConfidence
		}

		if (Object.keys(setData).length === 0) return this.findById(id)

		const [row] = await this.db
			.update(messagesTable)
			.set(setData)
			.where(eq(messagesTable.id, id))
			.returning(messageColumns)

		if (!row) return null
		return mapMessageRow(row)
	}

	/** Review queue ordered by action, score, recency, then id. */
	async getReviewMessages(
		channelId?: string,
		limit = 20,
		cursor?: string,
	): Promise<ReviewPageResult> {
		const conditions: SQL[] = [
			anyOf(
				eq(verdictsTable.status, "deleted"),
				eq(messagesTable.ai_status, "dead"),
			),
		]
		if (channelId) conditions.push(eq(messagesTable.channel_id, channelId))
		const excluded = excludeSpamThreads()
		if (excluded) conditions.push(excluded)

		const at = decodeReviewCursor(cursor)
		if (at) {
			conditions.push(
				sql`(${reviewActionRank}, ${reviewScoreRank}, ${messagesTable.created_at}, ${messagesTable.id}) < (${at.action}, ${at.score}, ${at.created_at}, ${at.id})`,
			)
		}

		// Filter and sort the whole queue BEFORE limiting. A bounded scan followed
		// by JS sorting loses candidates outside the scan and eventually stalls.
		const rows = await this.db
			.select({
				...messageWithVerdict,
				action_rank: reviewActionRank,
				score_rank: reviewScoreRank,
			})
			.from(messagesTable)
			.leftJoin(verdictsTable, eq(verdictsTable.message_id, messagesTable.id))
			.where(and(...conditions))
			.orderBy(
				desc(reviewActionRank),
				desc(reviewScoreRank),
				desc(messagesTable.created_at),
				desc(messagesTable.id),
			)
			.limit(cursorLimit(limit))

		const results = rows.slice(0, limit).map((r) => mapMessageRow(r))
		const last = rows.length > limit ? rows[limit - 1] : undefined
		const nextCursor = last
			? encodeReviewCursor({
					action: Number(last.action_rank),
					score: Number(last.score_rank),
					created_at: Number(last.created_at),
					id: last.id,
				})
			: null
		return { results, nextCursor }
	}

	async delete(id: string): Promise<boolean> {
		// `deleteMany`'s `{count}` becomes the length of the returning clause.
		const deleted = await this.db
			.delete(messagesTable)
			.where(eq(messagesTable.id, id))
			.returning({ id: messagesTable.id })

		return deleted.length > 0
	}

	async getImageMessages(
		guildId: string,
		limit: number = 50,
		cursor?: string,
	): Promise<PageResult<MessageRow>> {
		// EXISTS counts messages, not attachments: any number of images on one
		// message consumes exactly one page slot, without a bounded overscan.
		const matchingImage = this.db
			.select({ id: attachmentsTable.id })
			.from(attachmentsTable)
			.where(
				and(
					eq(attachmentsTable.message_id, messagesTable.id),
					eq(attachmentsTable.guild_id, guildId),
					sql`${attachmentsTable.type} LIKE ${"image/%"}`,
				),
			)
		const rows = await this.selectMessagePage(
			withPaging(
				[eq(messagesTable.guild_id, guildId), exists(matchingImage)],
				cursor,
			),
			limit,
		)

		const data = rows.slice(0, limit).map((r) => mapMessageRow(r))
		const nextCursor = nextCursorAt(rows, limit)

		logger.debug({ count: data.length, nextCursor }, "Found image messages")
		return { data, nextCursor }
	}

	async getAttachmentsByChannel(
		channelId: string,
		query: MessageQuery,
	): Promise<PageResult<AttachmentResult>> {
		const limit = query.limit ?? 50
		const conditions: SQL[] = [eq(attachmentsTable.channel_id, channelId)]

		// Detail view: narrow to the selected message so we don't show
		// everyone else's images from the same channel.
		if (query.messageId) {
			conditions.push(eq(attachmentsTable.message_id, query.messageId))
		}

		const after = buildCursorCondition(
			attachmentsTable.created_at,
			attachmentsTable.id,
			query.cursor,
		)
		if (after) conditions.push(after)

		const rows = await this.db
			.select()
			.from(attachmentsTable)
			.where(and(...conditions))
			.orderBy(desc(attachmentsTable.created_at), desc(attachmentsTable.id))
			.limit(cursorLimit(limit))

		const data = rows.map(mapAttachmentRow)

		// `nextCursorAt` reads the LAST RETURNED row (index `limit - 1`), not the
		// overflow row at index `limit`. An earlier comment here claimed index
		// `limit` "matches the other cursor-paginated queries" — it did, and that
		// was the bug in all of them: it skipped one row per page boundary. See
		// `nextCursorAt` for the full explanation.
		const nextCursor = nextCursorAt(rows, limit)
		const trimmed = data.slice(0, limit)

		return { data: trimmed, nextCursor }
	}

	/**
	 * Recent message edits across the server (evasion-signal tracker).
	 * Public, read-only. Joins message_edits → messages for context.
	 *
	 * Cursor-paged on `(edited_at, id)`. Unlike the review queue this one really
	 * does sort by recency, so a single timestamp cursor would almost be enough —
	 * but `id` is the tiebreak for the same reason as everywhere else: two edits
	 * in the same millisecond would otherwise be returned in an arbitrary order
	 * and could be duplicated or dropped across a page boundary.
	 */
	async getRecentEdits(
		limit = 50,
		channelId?: string,
		cursor?: string,
	): Promise<EditPageResult> {
		const at = decodeEditCursor(cursor)

		// The cursor replays the (edited_at, id) lexicographic comparison: strictly
		// older, OR same millisecond with a lower id.
		const conditions: SQL[] = []
		if (at) {
			conditions.push(
				anyOf(
					lt(messageEditsTable.edited_at, at.edited_at),
					allOf(
						eq(messageEditsTable.edited_at, at.edited_at),
						lt(messageEditsTable.id, at.id),
					),
				),
			)
		}
		if (channelId) conditions.push(eq(messagesTable.channel_id, channelId))

		// Join before LIMIT so orphaned edits cannot consume page slots or hide
		// a later valid edit; channel filtering also stays inside this query.
		const rows = await this.db
			.select({
				id: messageEditsTable.id,
				message_id: messageEditsTable.message_id,
				old_content: messageEditsTable.old_content,
				edited_at: messageEditsTable.edited_at,
				channel_id: messagesTable.channel_id,
				metadata: messagesTable.metadata,
				username: messagesTable.username,
				content: messagesTable.content,
				edited_content: messagesTable.edited_content,
			})
			.from(messageEditsTable)
			.innerJoin(
				messagesTable,
				eq(messagesTable.id, messageEditsTable.message_id),
			)
			.where(and(...conditions))
			.orderBy(desc(messageEditsTable.edited_at), desc(messageEditsTable.id))
			.limit(cursorLimit(limit))

		const results = rows.slice(0, limit).map((r) => ({
			id: r.id,
			message_id: r.message_id,
			old_content: r.old_content,
			new_content: r.edited_content ?? r.content,
			edited_at: Number(r.edited_at),
			channel_id: r.channel_id,
			channel_name: readChannelName(r.metadata) ?? r.channel_id,
			username: r.username,
		}))

		const last = rows.length > limit ? rows[limit - 1] : undefined
		const nextCursor = last
			? encodeEditCursor({
					edited_at: Number(last.edited_at ?? 0),
					id: String(last.id),
				})
			: null

		return { results, nextCursor }
	}

	/**
	 * Distinct guilds present in the message archive (drives the guild picker).
	 */
	async listGuilds(): Promise<
		Array<{ id: string; name: string; icon: string | null }>
	> {
		// `distinct: ["guild_id"]` becomes DISTINCT ON in SQL. The subquery keeps
		// `orderBy` honest: DISTINCT ON requires the ORDER BY to lead with the
		// distinct column, or Postgres rejects the query.
		const rows = await this.db
			.selectDistinct({ guild_id: messagesTable.guild_id })
			.from(messagesTable)
			.orderBy(asc(messagesTable.guild_id))
		return rows.map((row) => ({
			id: String(row.guild_id ?? ""),
			name: `Guild ${String(row.guild_id).slice(0, 8)}`,
			icon: null,
		}))
	}

	/**
	 * Text channels for a guild, derived from the message archive
	 * (drives the channel picker).
	 */
	async listTextChannels(
		guildId: string,
	): Promise<Array<{ id: string; name: string; type: "text" }>> {
		const rows = await this.db
			.selectDistinct({ channel_id: messagesTable.channel_id })
			.from(messagesTable)
			.where(eq(messagesTable.guild_id, guildId))
			.orderBy(asc(messagesTable.channel_id))
		return rows.map((row) => ({
			id: String(row.channel_id ?? ""),
			name: `Channel ${String(row.channel_id).slice(0, 8)}`,
			type: "text" as const,
		}))
	}
}
