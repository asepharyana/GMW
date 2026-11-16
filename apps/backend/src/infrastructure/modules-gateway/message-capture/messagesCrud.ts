import { and, desc, eq, or, type SQL } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "../../database/schema.js"
import { messageEditsTable, messagesTable } from "../../database/schema.js"
import { createChildLogger, type Logger } from "../../logger/index.js"
import { traceId } from "../ai-moderation/trace.js"
import type { MessageRecord } from "./types.js"
import { withErrorLog } from "./withErrorLog.js"

type MessageInsert = typeof messagesTable.$inferInsert

// ─── Shared Helpers ──────────────────────────────────────────────────────────

export function channelOrThreadCondition(
	channelId: string,
	table?: { channel_id: any; thread_id: any },
): SQL {
	const t = table ?? messagesTable
	return or(eq(t.channel_id, channelId), eq(t.thread_id, channelId)) as SQL
}

// ─── MessagesCrud Class ──────────────────────────────────────────────────────

export class MessagesCrud {
	private logger: Logger

	constructor(
		protected db: NodePgDatabase<typeof schema>,
		_parentLogger?: Logger,
	) {
		this.logger = _parentLogger ?? createChildLogger("messages-crud")
	}

	// ── INSERT ──────────────────────────────────────────────────────────────────

	async insertMessage(message: MessageRecord): Promise<void> {
		this.logger.debug({ messageId: message.id }, "insertMessage entry")
		await withErrorLog(
			this.logger,
			{ messageId: message.id },
			"Failed to insert message",
			() =>
				this.db
					.insert(messagesTable)
					.values(message as MessageInsert)
					.onConflictDoNothing(),
		)
	}

	async upsertMessageForCapture(message: MessageRecord): Promise<boolean> {
		this.logger.debug(
			{ messageId: message.id },
			"upsertMessageForCapture entry",
		)
		return withErrorLog(
			this.logger,
			{ messageId: message.id },
			"Failed to upsert message for capture",
			async () => {
				const messageWithAIStatus = {
					...message,
					ai_status: "pending" as const,
				}

				const rows = await this.db
					.insert(messagesTable)
					.values(messageWithAIStatus as MessageInsert)
					.onConflictDoNothing()
					.returning({ id: messagesTable.id })

				// Stage 1 of the trace. `inserted` distinguishes a genuinely new message
				// from a re-delivery (edits, gateway reconnects replaying history), which
				// is the difference between "queued for analysis" and "already known" —
				// worth one line, because a duplicate-delivery storm looks exactly like a
				// capture failure otherwise.
				if (rows.length > 0) {
					this.logger.info(
						{
							trace: traceId(message.id),
							messageId: message.id,
							stage: "captured",
							channelId: message.channel_id,
							authorId: message.user_id,
							contentChars: (message.content ?? "").length,
							inserted: true,
						},
						"message captured; queued for analysis",
					)
				} else {
					this.logger.debug(
						{
							trace: traceId(message.id),
							messageId: message.id,
							stage: "captured",
							inserted: false,
						},
						"message already stored; not re-queued",
					)
				}

				return rows.length > 0
			},
		)
	}

	// ── UPDATE ──────────────────────────────────────────────────────────────────

	/**
	 * `metadata` is the REFRESHED metadata, not the stored one. An edit that
	 * adds an attachment or changes the reply target leaves the text identical,
	 * so without this the row kept describing the pre-edit message and the
	 * re-analysis was asked to judge evidence that was not there.
	 */
	async updateMessageAsEdited(
		messageId: string,
		editedContent: string,
		editedAt: number,
		metadata?: string,
	): Promise<void> {
		this.logger.debug({ messageId }, "updateMessageAsEdited entry")
		await withErrorLog(
			this.logger,
			{ messageId },
			"Failed to update message as edited",
			async () => {
				await this.db
					.update(messagesTable)
					.set({
						edited_content: editedContent,
						edited_at: editedAt,
						type: "edited",
						...(metadata !== undefined ? { metadata } : {}),
						ai_status: "pending",
						ai_moderation_flags: null,
						ai_moderation_score: null,
						ai_analysis: null,
						ai_categories: null,
						ai_confidence: null,
						ai_analyzed_at: null,
						ai_error: null,
					})
					.where(eq(messagesTable.id, messageId))
			},
		)
	}

	async updateMessageAsDeleted(
		messageId: string,
		deletedAt: number,
	): Promise<void> {
		this.logger.debug({ messageId }, "updateMessageAsDeleted entry")
		await withErrorLog(
			this.logger,
			{ messageId },
			"Failed to update message as deleted",
			() =>
				this.db
					.update(messagesTable)
					.set({
						deleted_at: deletedAt,
						type: "deleted",
					})
					.where(eq(messagesTable.id, messageId)),
		)
	}

	// ── EDIT HISTORY ──────────────────────────────────────────────────────────────

	async insertMessageEdit(
		messageId: string,
		oldContent: string,
		editedAt: number,
	): Promise<void> {
		this.logger.debug({ messageId }, "insertMessageEdit entry")
		await withErrorLog(
			this.logger,
			{ messageId },
			"Failed to insert message edit",
			() =>
				this.db
					.insert(messageEditsTable)
					.values({
						message_id: messageId,
						old_content: oldContent,
						edited_at: editedAt,
					})
					.onConflictDoNothing(),
		)
	}

	// ── GET ─────────────────────────────────────────────────────────────────────

	async getMessagesByChannel(
		channelId: string,
		limit: number = 50,
		offset: number = 0,
		guildId?: string,
	): Promise<MessageRecord[]> {
		this.logger.debug(
			{ channelId, limit, offset, guildId },
			"getMessagesByChannel entry",
		)
		return withErrorLog(
			this.logger,
			{ channelId },
			"Failed to get messages by channel",
			async () => {
				const conditions: SQL[] = [channelOrThreadCondition(channelId)]

				if (guildId) {
					conditions.push(eq(messagesTable.guild_id, guildId))
				}

				const rows = await this.db
					.select()
					.from(messagesTable)
					.where(and(...conditions))
					.orderBy(desc(messagesTable.created_at), desc(messagesTable.id))
					.limit(limit)
					.offset(offset)

				return rows as MessageRecord[]
			},
		)
	}

	async getMessageById(messageId: string): Promise<MessageRecord | null> {
		this.logger.debug({ messageId }, "getMessageById entry")
		return withErrorLog(
			this.logger,
			{ messageId },
			"Failed to get message by id",
			async () => {
				const rows = await this.db
					.select()
					.from(messagesTable)
					.where(eq(messagesTable.id, messageId))

				return (rows[0] as MessageRecord) ?? null
			},
		)
	}
}
