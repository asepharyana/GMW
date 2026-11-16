import { and, eq, isNull, sql } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "../../database/schema.js"
import { messagesTable } from "../../database/schema.js"
import { createChildLogger, type Logger } from "../../logger/index.js"
import type { MessageRecord } from "./types.js"
import { withErrorLog } from "./withErrorLog.js"

// ─── MessagesCleanup Class ────────────────────────────────────────────────────

export class MessagesCleanup {
	private logger: Logger

	constructor(
		private db: NodePgDatabase<typeof schema>,
		_parentLogger?: Logger,
	) {
		this.logger = createChildLogger("messages-cleanup")
	}

	async getExpiredMessages(retentionDays: number): Promise<MessageRecord[]> {
		if (retentionDays <= 0) return []
		this.logger.debug({ retentionDays }, "getExpiredMessages entry")
		return withErrorLog(
			this.logger,
			{ retentionDays },
			"Failed to get expired messages",
			async () => {
				const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000

				const rows = await this.db
					.select()
					.from(messagesTable)
					.where(
						and(
							sql`${messagesTable.created_at} < ${cutoffTime}`,
							isNull(messagesTable.deleted_at),
						),
					)
					.limit(1000)

				return rows as MessageRecord[]
			},
		)
	}

	/**
	 * Last-resort recoverer for rows left `claimed` by a worker that died.
	 *
	 * This used to filter on `ai_status = 'processing'`, a v1 state that the
	 * 0020 CHECK constraint forbids, so it matched nothing and silently always
	 * returned 0 — the failure mode it was written to prevent, invisible
	 * because the catch swallowed the violation.
	 *
	 * v2 reclaims by LEASE, not by a status timeout: a `claimed` row whose
	 * `lease_until` has passed is free to be taken. The authoritative
	 * implementation is `reclaim_expired_claims()` in SQL, which is what the
	 * worker calls; this mirrors its predicate so the two cannot disagree.
	 */
	async revertStuckProcessingMessages(
		timeoutMs: number = 120000,
	): Promise<number> {
		this.logger.debug({ timeoutMs }, "revertStuckProcessingMessages entry")
		try {
			const cutoffTime = Date.now() - timeoutMs

			const rows = await this.db
				.update(messagesTable)
				.set({ ai_status: "pending", worker_id: null, lease_until: null })
				.where(
					and(
						eq(messagesTable.ai_status, "claimed"),
						sql`${messagesTable.lease_until} IS NOT NULL AND ${messagesTable.lease_until} < ${cutoffTime}`,
					),
				)
				.returning({ id: messagesTable.id })

			if (Array.isArray(rows) && rows.length > 0) {
				this.logger.info(
					{
						count: rows.length,
						messageIds: rows.map((r: { id: string }) => r.id),
					},
					"Reverted stuck processing messages back to pending",
				)
			}

			return Array.isArray(rows) ? rows.length : 0
		} catch (error) {
			this.logger.error(
				{ error: error instanceof Error ? error.message : String(error) },
				"Failed to revert stuck processing messages",
			)
			return 0
		}
	}
}
