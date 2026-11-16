import { and, desc, eq, inArray, type SQL } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import { pageResult } from "../../../domain/utils/pagination.js"
import { buildCursorCondition } from "../../database/cursor.js"
import type * as schema from "../../database/schema.js"
import { moderationActionsTable } from "../../database/schema.js"
import { createChildLogger, type Logger } from "../../logger/index.js"
import type { EventBroadcaster } from "../event-broadcaster/eventBroadcaster.js"
import type { ModerationAction, PageResult } from "./types.js"
import { withErrorLog } from "./withErrorLog.js"

let _eventBroadcaster: EventBroadcaster | null = null

/** Inject the gateway's event broadcaster so actions can be published live. */
export function setModerationEventBroadcaster(eb: EventBroadcaster): void {
	_eventBroadcaster = eb
}

// ─── ModerationActionsDb Class ──────────────────────────────────────────────

export class ModerationActionsDb {
	private logger: Logger

	constructor(
		private db: NodePgDatabase<typeof schema>,
		_parentLogger?: Logger,
	) {
		this.logger = createChildLogger("moderation-actions-db")
	}

	async createModerationAction(
		action: Omit<ModerationAction, "id" | "created_at">,
	): Promise<ModerationAction> {
		this.logger.debug(
			{ guildId: action.guild_id },
			"createModerationAction entry",
		)
		return withErrorLog(
			this.logger,
			{ guildId: action.guild_id },
			"Failed to create moderation action",
			async () => {
				const id = `action-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
				const created_at = Date.now()

				const rows = await this.db
					.insert(moderationActionsTable)
					.values({
						...action,
						id,
						created_at,
					})
					.returning()

				const created = rows[0] as ModerationAction

				// Fire-and-forget live broadcast (backend WS → frontend feed).
				if (_eventBroadcaster) {
					_eventBroadcaster
						.moderationAction(created as unknown as Record<string, unknown>)
						.catch(() => {})
				}

				return created
			},
		)
	}

	async getModerationAction(id: string): Promise<ModerationAction | null> {
		this.logger.debug({ actionId: id }, "getModerationAction entry")
		return withErrorLog(
			this.logger,
			{ actionId: id },
			"Failed to get moderation action",
			async () => {
				const rows = await this.db
					.select()
					.from(moderationActionsTable)
					.where(eq(moderationActionsTable.id, id))

				return (rows[0] as ModerationAction) || null
			},
		)
	}

	async listModerationActions(query: {
		guildId?: string
		status?: string[]
		cursor?: string
		limit: number
	}): Promise<PageResult<ModerationAction>> {
		this.logger.debug({ query }, "listModerationActions entry")
		return withErrorLog(
			this.logger,
			{},
			"Failed to list moderation actions",
			async () => {
				const limit = Math.max(1, Math.min(query.limit || 50, 100))
				const conditions: SQL[] = []

				if (query.guildId) {
					conditions.push(eq(moderationActionsTable.guild_id, query.guildId))
				}
				if (query.status && query.status.length > 0) {
					conditions.push(
						inArray(
							moderationActionsTable.status,
							query.status as Array<"pending" | "failed" | "executed">,
						),
					)
				}

				const cursorCondition = buildCursorCondition(
					moderationActionsTable.created_at,
					moderationActionsTable.id,
					query.cursor,
				)
				if (cursorCondition) {
					conditions.push(cursorCondition)
				}

				const rows = await this.db
					.select()
					.from(moderationActionsTable)
					.where(conditions.length > 0 ? and(...conditions) : undefined)
					.orderBy(
						desc(moderationActionsTable.created_at),
						desc(moderationActionsTable.id),
					)
					.limit(limit + 1)

				return pageResult<ModerationAction>(rows, limit)
			},
		)
	}

	async updateModerationAction(
		id: string,
		updates: Partial<Omit<ModerationAction, "id" | "created_at">>,
	): Promise<ModerationAction | null> {
		this.logger.debug({ actionId: id }, "updateModerationAction entry")
		return withErrorLog(
			this.logger,
			{ actionId: id },
			"Failed to update moderation action",
			async () => {
				const rows = (await this.db
					.update(moderationActionsTable)
					.set(updates)
					.where(eq(moderationActionsTable.id, id))
					.returning()) as ModerationAction[]

				return rows[0] || null
			},
		)
	}
}
