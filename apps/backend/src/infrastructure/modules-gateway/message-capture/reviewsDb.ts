import { and, desc, eq, inArray, type SQL } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import { pageResult } from "../../../domain/utils/pagination.js"
import { buildCursorCondition } from "../../database/cursor.js"
import type * as schema from "../../database/schema.js"
import { messageReviewsTable } from "../../database/schema.js"
import { createChildLogger, type Logger } from "../../logger/index.js"
import type { MessageReview, PageResult } from "./types.js"
import { withErrorLog } from "./withErrorLog.js"

// ─── ReviewsDb Class ────────────────────────────────────────────────────────

export class ReviewsDb {
	private logger: Logger

	constructor(
		private db: NodePgDatabase<typeof schema>,
		_parentLogger?: Logger,
	) {
		this.logger = createChildLogger("reviews-db")
	}

	async createMessageReview(
		review: Omit<MessageReview, "id" | "created_at">,
	): Promise<MessageReview> {
		this.logger.debug(
			{ messageId: review.message_id },
			"createMessageReview entry",
		)
		return withErrorLog(
			this.logger,
			{ messageId: review.message_id },
			"Failed to create message review",
			async () => {
				const id = `review-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
				const created_at = Date.now()

				const rows = await this.db
					.insert(messageReviewsTable)
					.values({
						...review,
						id,
						created_at,
					})
					.returning()

				return rows[0] as MessageReview
			},
		)
	}

	async getMessageReview(id: string): Promise<MessageReview | null> {
		this.logger.debug({ reviewId: id }, "getMessageReview entry")
		return withErrorLog(
			this.logger,
			{ reviewId: id },
			"Failed to get message review",
			async () => {
				const rows = await this.db
					.select()
					.from(messageReviewsTable)
					.where(eq(messageReviewsTable.id, id))

				return (rows[0] as MessageReview) || null
			},
		)
	}

	async listMessageReviews(query: {
		guildId?: string
		channelId?: string
		status?: string[]
		cursor?: string
		limit: number
	}): Promise<PageResult<MessageReview>> {
		this.logger.debug({ query }, "listMessageReviews entry")
		return withErrorLog(
			this.logger,
			{},
			"Failed to list message reviews",
			async () => {
				const limit = Math.max(1, Math.min(query.limit || 50, 100))
				const conditions: SQL[] = []

				if (query.guildId) {
					conditions.push(eq(messageReviewsTable.guild_id, query.guildId))
				}
				if (query.channelId) {
					conditions.push(eq(messageReviewsTable.channel_id, query.channelId))
				}
				if (query.status && query.status.length > 0) {
					conditions.push(
						inArray(
							messageReviewsTable.status,
							query.status as Array<
								"pending" | "approved" | "rejected" | "escalated"
							>,
						),
					)
				}

				const cursorCondition = buildCursorCondition(
					messageReviewsTable.created_at,
					messageReviewsTable.id,
					query.cursor,
				)
				if (cursorCondition) {
					conditions.push(cursorCondition)
				}

				const rows = await this.db
					.select()
					.from(messageReviewsTable)
					.where(conditions.length > 0 ? and(...conditions) : undefined)
					.orderBy(
						desc(messageReviewsTable.created_at),
						desc(messageReviewsTable.id),
					)
					.limit(limit + 1)

				return pageResult<MessageReview>(rows, limit)
			},
		)
	}

	async updateMessageReview(
		id: string,
		updates: Partial<Omit<MessageReview, "id" | "created_at">>,
	): Promise<MessageReview | null> {
		this.logger.debug({ reviewId: id }, "updateMessageReview entry")
		return withErrorLog(
			this.logger,
			{ reviewId: id },
			"Failed to update message review",
			async () => {
				const rows = (await this.db
					.update(messageReviewsTable)
					.set(updates)
					.where(eq(messageReviewsTable.id, id))
					.returning()) as MessageReview[]

				return rows[0] || null
			},
		)
	}
}
