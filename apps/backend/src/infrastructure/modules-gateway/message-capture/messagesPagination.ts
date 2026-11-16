import { and, desc, eq, inArray, type SQL, sql } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import { pageResult } from "../../../domain/utils/pagination.js"
import { buildCursorCondition } from "../../database/cursor.js"
import type * as schema from "../../database/schema.js"
import { messagesTable } from "../../database/schema.js"
import { createChildLogger, type Logger } from "../../logger/index.js"
import { channelOrThreadCondition } from "./messagesCrud.js"
import type { MessageQuery, MessageRecord, PageResult } from "./types.js"
import { withErrorLog } from "./withErrorLog.js"

/** The only values `messages.ai_status` can hold (see migration 0020). */
const QUEUE_STATES = [
	"pending",
	"claimed",
	"analyzed",
	"retry_wait",
	"skipped",
	"dead",
] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function buildListMessageConditions(query: MessageQuery): SQL[] {
	const conditions: SQL[] = []

	if (query.guildId) {
		conditions.push(eq(messagesTable.guild_id, query.guildId))
	}

	if (query.channelId) {
		conditions.push(channelOrThreadCondition(query.channelId))
	}

	if (query.threadId) {
		conditions.push(eq(messagesTable.thread_id, query.threadId))
	}

	if (query.userId) {
		conditions.push(eq(messagesTable.user_id, query.userId))
	}

	// `ai_status` is the QUEUE state in the v2 state machine, not the
	// judgement. It only ever holds:
	//   pending | claimed | analyzed | retry_wait | dead | skipped
	// and a hard CHECK constraint (0020:58) rejects anything else. The v1
	// values this filter used to accept ("clean", "warn", "flagged", "error",
	// "processing") can therefore never match a row, which is why
	// `listReviewMessages` returned an empty page forever: it asked for
	// warnings and flags in a column that no longer holds them.
	//
	// The judgement lives in `verdicts.status`, joined by the backend. This
	// filter is only meaningful for queue state, so it accepts the v2 set.
	if (query.status && query.status.length > 0) {
		const requested = query.status.filter((s) =>
			(QUEUE_STATES as readonly string[]).includes(s),
		)
		if (requested.length > 0) {
			conditions.push(
				inArray(
					messagesTable.ai_status,
					requested as Array<
						| "pending"
						| "claimed"
						| "analyzed"
						| "retry_wait"
						| "dead"
						| "skipped"
					>,
				),
			)
		}
	}

	if (query.q) {
		const pattern = `%${query.q.toLowerCase()}%`
		conditions.push(sql`lower(${messagesTable.content}) like ${pattern}`)
	}

	const cursorCondition = buildCursorCondition(
		messagesTable.created_at,
		messagesTable.id,
		query.cursor,
	)
	if (cursorCondition) {
		conditions.push(cursorCondition)
	}

	return conditions
}

// ─── MessagesPagination Class ────────────────────────────────────────────────

export class MessagesPagination {
	private logger: Logger

	constructor(
		private db: NodePgDatabase<typeof schema>,
		_parentLogger?: Logger,
	) {
		this.logger = createChildLogger("messages-pagination")
	}

	async listMessages(query: MessageQuery): Promise<PageResult<MessageRecord>> {
		this.logger.debug({ query }, "listMessages entry")
		return withErrorLog(
			this.logger,
			{ query },
			"Failed to list messages",
			async () => {
				const conditions = buildListMessageConditions(query)
				// Clamp. `limit` reaches this from the dashboard, and the other two
				// paginated readers (reviews, moderation actions) already clamp:
				//   limit = 0  → .limit(1), hasMore true, data [], lastItem undefined
				//                 → nextCursor null: an empty page the client cannot
				//                   advance past. A silent dead end, no error.
				//   limit < 0  → a Drizzle error.
				const limit = Math.max(1, Math.min(query.limit || 50, 200))
				const rows = await this.db
					.select()
					.from(messagesTable)
					.where(conditions.length > 0 ? and(...conditions) : undefined)
					.orderBy(desc(messagesTable.created_at), desc(messagesTable.id))
					.limit(limit + 1)

				return pageResult<MessageRecord>(rows, limit)
			},
		)
	}

	/**
	 * Messages awaiting a human decision.
	 *
	 * The judgement is in `verdicts.status`, not `messages.ai_status`, so this
	 * cannot be expressed as an `ai_status` filter any more. It selects the
	 * terminal queue states (the only ones a reviewer can act on) and leaves
	 * the verdict join to the caller, which already does it.
	 */
	async listReviewMessages(
		query: Omit<MessageQuery, "status">,
	): Promise<PageResult<MessageRecord>> {
		return this.listMessages({
			...query,
			status: ["analyzed"],
		})
	}
}
