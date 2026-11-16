import { and, desc, eq, isNull, or, type SQL, sql } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "../../database/schema.js"
import { messagesTable } from "../../database/schema.js"
import { createChildLogger, type Logger } from "../../logger/index.js"
import { channelOrThreadCondition } from "./messagesCrud.js"
import type { MessageRecord } from "./types.js"
import { withErrorLog } from "./withErrorLog.js"

// ─── MessagesSearch Class ─────────────────────────────────────────────────────

export class MessagesSearch {
	private logger: Logger

	constructor(
		private db: NodePgDatabase<typeof schema>,
		_parentLogger?: Logger,
	) {
		this.logger = createChildLogger("messages-search")
	}

	async searchMessages(input: {
		query: string
		channelId?: string
		guildId?: string
		limit?: number
	}): Promise<MessageRecord[]> {
		this.logger.debug({ query: input.query }, "searchMessages entry")
		return withErrorLog(
			this.logger,
			{
				query: input.query,
				channelId: input.channelId,
				guildId: input.guildId,
			},
			"Failed to search messages",
			async () => {
				const { query, channelId, guildId } = input
				// Clamp. An unbounded limit is a full table scan pulled into memory,
				// and this is reachable from the dashboard's search box.
				const limit = Math.min(Math.max(1, input.limit ?? 20), 200)

				// The pattern is LOWERED, because the column is compared with
				// `lower(content)`. The previous code lowercased neither side, so a
				// search for "Halo" found nothing in a column holding "halo".
				//
				// LIKE metacharacters must also be escaped: a user typing `%` or `_`
				// otherwise injects a wildcard and matches every row — the exact
				// opposite of what they asked for, and a cheap way to enumerate the
				// archive.
				const escaped = query.replace(/[\\%_]/g, (c) => `\\${c}`)
				const searchPattern = `%${escaped.toLowerCase()}%`
				const conditions: (SQL | undefined)[] = [
					isNull(messagesTable.deleted_at),
				]

				if (guildId) {
					conditions.push(eq(messagesTable.guild_id, guildId))
				}

				if (channelId) {
					conditions.push(channelOrThreadCondition(channelId))
				}

				conditions.push(
					or(
						sql`lower(${messagesTable.content}) LIKE ${searchPattern} ESCAPE '\\'`,
						sql`lower(${messagesTable.edited_content}) LIKE ${searchPattern} ESCAPE '\\'`,
					),
				)

				const validConditions = conditions.filter(
					(c): c is SQL => c !== undefined,
				)

				const rows = await this.db
					.select()
					.from(messagesTable)
					.where(and(...validConditions))
					.orderBy(desc(messagesTable.created_at))
					.limit(limit)

				return rows as MessageRecord[]
			},
		)
	}
}
