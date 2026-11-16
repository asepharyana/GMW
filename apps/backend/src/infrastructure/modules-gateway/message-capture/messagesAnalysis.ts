import {
	and,
	asc,
	desc,
	eq,
	inArray,
	isNull,
	or,
	type SQL,
	sql,
} from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "../../database/schema.js"
import { messagesTable } from "../../database/schema.js"
import { createChildLogger, type Logger } from "../../logger/index.js"
import type { MessageRecord } from "./types.js"
import { withErrorLog } from "./withErrorLog.js"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stringifyAIList(
	value: string[] | string | null | undefined,
): string | null {
	if (value == null) return null
	return Array.isArray(value) ? JSON.stringify(value) : value
}

// ─── Shared query fragments ──────────────────────────────────────────────────

type ConversationRow = { thread_id: string | null; channel_id: string }

/** Unpaid work: queued for analysis and not deleted. */
function pendingCondition(): SQL {
	return and(
		eq(messagesTable.ai_status, "pending"),
		isNull(messagesTable.deleted_at),
	) as SQL
}

/**
 * Messages the worker gave up on part-way through a batch.
 *
 * "dead", not "error": the v1 pipeline parked an unjudgeable message at
 * 'error'; the v2 state machine parks it at 'dead' after maxAttempts. The
 * 'error' state no longer exists, so a filter on it could never match a row.
 */
function incompleteAnalysisCondition(): SQL {
	return and(
		eq(messagesTable.ai_status, "dead"),
		sql`${messagesTable.ai_moderation_flags} LIKE ${"%analysis_incomplete%"}`,
		sql`(${messagesTable.ai_moderation_flags} IS NULL OR ${messagesTable.ai_moderation_flags} NOT LIKE ${"%individual_analysis_exhausted%"})`,
		isNull(messagesTable.deleted_at),
	) as SQL
}

/** A conversation is a thread, or the channel when there is no thread. */
function inConversation(conversationKey: string): SQL {
	return or(
		eq(messagesTable.thread_id, conversationKey),
		eq(messagesTable.channel_id, conversationKey),
	) as SQL
}

/** Distinct conversation keys, first-seen order preserved. */
function distinctConversationKeys(rows: ConversationRow[]): string[] {
	const keys = new Set<string>()
	for (const row of rows) {
		const key = row.thread_id || row.channel_id
		if (key) keys.add(key)
	}
	return [...keys]
}

// ─── AIAnalysisUpdate interface ──────────────────────────────────────────────

export interface AIAnalysisUpdate {
	/**
	 * Queue state, matching the 0020 CHECK constraint. The v1 values
	 * ("processing", "clean", "warn", "flagged", "error") are rejected by the
	 * database, so they must not be offered here.
	 */
	status: "pending" | "claimed" | "analyzed" | "retry_wait" | "dead" | "skipped"
	flags?: string | null
	score?: number | null
	analysis?: string | null
	categories?: string[] | string | null
	confidence?: number | null
	analyzedAt?: number | null
	/** Wall-clock time the AI analysis (LLM call) took, in milliseconds. */
	analysisDurationMs?: number | null
	error?: string | null
}

// ─── Shared field mapping helper ─────────────────────────────────────────────

function buildAIAnalysisSet(result: AIAnalysisUpdate, now?: number) {
	return {
		ai_status: result.status,
		ai_moderation_flags: result.flags ?? null,
		ai_moderation_score: result.score ?? null,
		ai_analysis: result.analysis ?? null,
		ai_categories: stringifyAIList(result.categories),
		ai_confidence: result.confidence ?? result.score ?? null,
		ai_analyzed_at: result.analyzedAt ?? now ?? Date.now(),
		ai_analysis_duration_ms: result.analysisDurationMs ?? null,
		ai_error: result.error ?? null,
	}
}

// ─── MessagesAnalysis Class ───────────────────────────────────────────────────

export class MessagesAnalysis {
	private logger: Logger

	constructor(
		protected db: NodePgDatabase<typeof schema>,
		_parentLogger?: Logger,
	) {
		this.logger = createChildLogger("messages-analysis")
	}

	// ── AI Analysis Updates ─────────────────────────────────────────────────────

	async updateMessageAIAnalysis(
		messageId: string,
		result: AIAnalysisUpdate,
	): Promise<MessageRecord | null> {
		this.logger.debug({ messageId }, "updateMessageAIAnalysis entry")
		return withErrorLog(
			this.logger,
			{ messageId },
			"Failed to update message AI analysis",
			async () => {
				await this.db
					.update(messagesTable)
					.set(buildAIAnalysisSet(result))
					.where(eq(messagesTable.id, messageId))

				const rows = await this.db
					.select()
					.from(messagesTable)
					.where(eq(messagesTable.id, messageId))

				return (rows[0] as MessageRecord) ?? null
			},
		)
	}

	async updateMessagesAIAnalysisBulk(
		updates: Array<{ messageId: string; result: AIAnalysisUpdate }>,
	): Promise<MessageRecord[]> {
		this.logger.debug(
			{ count: updates.length },
			"updateMessagesAIAnalysisBulk entry",
		)
		if (updates.length === 0) return []
		return withErrorLog(
			this.logger,
			{},
			"Failed to bulk update messages AI analysis",
			async () => {
				const now = Date.now()

				await this.db.transaction(async (tx) => {
					for (const { messageId, result } of updates) {
						await tx
							.update(messagesTable)
							.set(buildAIAnalysisSet(result, now))
							.where(eq(messagesTable.id, messageId))
					}
				})

				const ids = updates.map(({ messageId }) => messageId)
				const rows = await this.db
					.select()
					.from(messagesTable)
					.where(inArray(messagesTable.id, ids))

				return rows as MessageRecord[]
			},
		)
	}

	async getPendingAIAnalysisMessages(
		limit: number = 25,
	): Promise<MessageRecord[]> {
		this.logger.debug({ limit }, "getPendingAIAnalysisMessages entry")
		return withErrorLog(
			this.logger,
			{},
			"Failed to get pending AI analysis messages",
			async () => {
				const rows = await this.db
					.select()
					.from(messagesTable)
					.where(pendingCondition())
					.orderBy(asc(messagesTable.created_at))
					.limit(limit)

				return rows as MessageRecord[]
			},
		)
	}

	// ── Conversation Context ────────────────────────────────────────────────────

	async getConversationContextBefore(input: {
		channelId: string
		threadId: string | null
		beforeCreatedAt: number
		limit: number
	}): Promise<MessageRecord[]> {
		this.logger.debug(
			{ channelId: input.channelId, threadId: input.threadId },
			"getConversationContextBefore entry",
		)
		return withErrorLog(
			this.logger,
			{ channelId: input.channelId, threadId: input.threadId },
			"Failed to get conversation context before",
			async () => {
				const { channelId, threadId, beforeCreatedAt, limit } = input

				const locationCondition = threadId
					? eq(messagesTable.thread_id, threadId)
					: eq(messagesTable.channel_id, channelId)

				const rows = await this.db
					.select()
					.from(messagesTable)
					.where(
						and(
							locationCondition,
							sql`${messagesTable.created_at} < ${beforeCreatedAt}`,
							isNull(messagesTable.deleted_at),
						),
					)
					.orderBy(desc(messagesTable.created_at))
					.limit(limit)

				return (rows as MessageRecord[]).reverse()
			},
		)
	}

	/**
	 * Lock up to `limit` messages matching `condition` (oldest first, skipping
	 * rows another worker holds) and flip them to "claimed" in one transaction.
	 *
	 * "claimed", not "processing": the 0020 CHECK constraint rejects
	 * "processing", so that write threw a check_violation and the whole
	 * transaction rolled back. The methods that use this have no callers today,
	 * which is why nobody noticed — the next caller would have got an exception
	 * instead of a row.
	 *
	 * UPDATE..RETURNING has no guaranteed row order (Postgres returns rows in
	 * physical update order). Consumers rely on chronological order: the
	 * moderation worker's batch context treats the array as a created_at ASC
	 * prefix, and the context anchor uses messages[0].created_at. So the result
	 * is re-sorted here.
	 */
	private async claimMessages(
		condition: SQL,
		limit: number,
	): Promise<MessageRecord[]> {
		const rows = await this.db.transaction(async (tx) => {
			const pendingIdsQuery = tx
				.select({ id: messagesTable.id })
				.from(messagesTable)
				.where(condition)
				.orderBy(asc(messagesTable.created_at))
				.limit(limit)
				.for("update", { skipLocked: true })

			const pendingIds = (await pendingIdsQuery) as Array<{ id: string }>

			if (pendingIds.length === 0) return []

			return await tx
				.update(messagesTable)
				.set({
					ai_status: "claimed",
					worker_id: null,
					lease_until: null,
					ai_analyzed_at: null,
				})
				.where(
					inArray(
						messagesTable.id,
						pendingIds.map((r) => r.id),
					),
				)
				.returning()
		})

		rows.sort(
			(a, b) =>
				(a as MessageRecord).created_at - (b as MessageRecord).created_at,
		)
		return rows as MessageRecord[]
	}

	async getPendingMessagesByConversation(
		conversationKey: string,
		limit: number = 200,
	): Promise<MessageRecord[]> {
		this.logger.debug(
			{ conversationKey, limit },
			"getPendingMessagesByConversation entry",
		)
		return withErrorLog(
			this.logger,
			{ conversationKey },
			"Failed to get pending messages by conversation",
			() =>
				this.claimMessages(
					and(inConversation(conversationKey), pendingCondition()) as SQL,
					limit,
				),
		)
	}

	async getPendingConversationKeys(limit: number = 500): Promise<string[]> {
		this.logger.debug({ limit }, "getPendingConversationKeys entry")
		return withErrorLog(
			this.logger,
			{},
			"Failed to get pending conversation keys",
			async () => {
				const rows = (await this.db
					.selectDistinct({
						thread_id: messagesTable.thread_id,
						channel_id: messagesTable.channel_id,
					})
					.from(messagesTable)
					.where(pendingCondition())
					.limit(limit)) as ConversationRow[]

				return distinctConversationKeys(rows)
			},
		)
	}

	async getConversationKeysWithIncompleteAnalysis(
		limit: number = 200,
	): Promise<string[]> {
		this.logger.debug(
			{ limit },
			"getConversationKeysWithIncompleteAnalysis entry",
		)
		return withErrorLog(
			this.logger,
			{},
			"Failed to get conversation keys with incomplete analysis",
			async () => {
				const rows = (await this.db
					.selectDistinct({
						thread_id: messagesTable.thread_id,
						channel_id: messagesTable.channel_id,
					})
					.from(messagesTable)
					.where(incompleteAnalysisCondition())
					.limit(limit)) as ConversationRow[]

				return distinctConversationKeys(rows)
			},
		)
	}

	async getIncompleteMessagesByConversation(
		conversationKey: string,
		limit: number = 500,
	): Promise<MessageRecord[]> {
		this.logger.debug(
			{ conversationKey, limit },
			"getIncompleteMessagesByConversation entry",
		)
		return withErrorLog(
			this.logger,
			{ conversationKey },
			"Failed to get incomplete messages by conversation",
			() =>
				this.claimMessages(
					and(
						inConversation(conversationKey),
						incompleteAnalysisCondition(),
					) as SQL,
					limit,
				),
		)
	}
}
