import { and, desc, eq, inArray, type SQL } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "../../database/schema.js"
import { attachmentsTable } from "../../database/schema.js"
import { createChildLogger, type Logger } from "../../logger/index.js"
import { channelOrThreadCondition } from "./messagesCrud.js"
import type { AttachmentRecord } from "./types.js"
import { withErrorLog } from "./withErrorLog.js"

// ─── AttachmentsDb Class ────────────────────────────────────────────────────

export class AttachmentsDb {
	private logger: Logger

	constructor(
		private db: NodePgDatabase<typeof schema>,
		_parentLogger?: Logger,
	) {
		this.logger = _parentLogger ?? createChildLogger("attachments-db")
	}

	async insertAttachment(attachment: AttachmentRecord): Promise<void> {
		this.logger.debug({ attachmentId: attachment.id }, "insertAttachment entry")
		return withErrorLog(
			this.logger,
			{ attachmentId: attachment.id },
			"Failed to insert attachment",
			async () => {
				await this.db
					.insert(attachmentsTable)
					.values(attachment)
					.onConflictDoNothing()
			},
		)
	}

	async getAttachmentsByChannel(
		channelId: string,
		limit: number = 50,
		offset: number = 0,
		guildId?: string,
	): Promise<AttachmentRecord[]> {
		this.logger.debug(
			{ channelId, limit, offset },
			"getAttachmentsByChannel entry",
		)
		return withErrorLog(
			this.logger,
			{ channelId },
			"Failed to get attachments by channel",
			async () => {
				const conditions: SQL[] = [
					channelOrThreadCondition(channelId, attachmentsTable),
				]

				if (guildId) {
					conditions.push(eq(attachmentsTable.guild_id, guildId))
				}

				const rows = await this.db
					.select()
					.from(attachmentsTable)
					.where(and(...conditions))
					.orderBy(desc(attachmentsTable.created_at))
					.limit(limit)
					.offset(offset)

				return rows as AttachmentRecord[]
			},
		)
	}

	async updateAttachmentAsUploaded(
		attachmentId: string,
		uploadedUrl: string,
		uploadedAt: number,
	): Promise<void> {
		this.logger.debug({ attachmentId }, "updateAttachmentAsUploaded entry")
		return withErrorLog(
			this.logger,
			{ attachmentId },
			"Failed to update attachment as uploaded",
			async () => {
				await this.db
					.update(attachmentsTable)
					.set({
						uploaded_url: uploadedUrl,
						upload_status: "uploaded",
						uploaded_at: uploadedAt,
					})
					.where(eq(attachmentsTable.id, attachmentId))
			},
		)
	}

	async updateAttachmentDiscordUrl(
		attachmentId: string,
		discordUrl: string,
	): Promise<void> {
		this.logger.debug({ attachmentId }, "updateAttachmentDiscordUrl entry")
		return withErrorLog(
			this.logger,
			{ attachmentId },
			"Failed to update attachment Discord URL",
			async () => {
				await this.db
					.update(attachmentsTable)
					.set({ discord_url: discordUrl })
					.where(eq(attachmentsTable.id, attachmentId))
			},
		)
	}

	async updateAttachmentAsFailedUpload(
		attachmentId: string,
		error: string,
	): Promise<void> {
		this.logger.debug({ attachmentId }, "updateAttachmentAsFailedUpload entry")
		return withErrorLog(
			this.logger,
			{ attachmentId },
			"Failed to update attachment as failed",
			async () => {
				await this.db
					.update(attachmentsTable)
					.set({
						upload_status: "failed",
						upload_error: error,
					})
					.where(eq(attachmentsTable.id, attachmentId))
			},
		)
	}

	async getAttachmentsForMessages(
		messageIds: string[],
	): Promise<AttachmentRecord[]> {
		this.logger.debug(
			{ messageIdsCount: messageIds.length },
			"getAttachmentsForMessages entry",
		)
		return withErrorLog(
			this.logger,
			{ messageIds },
			"Failed to get attachments for messages",
			async () => {
				if (messageIds.length === 0) return []
				const rows = await this.db
					.select()
					.from(attachmentsTable)
					.where(inArray(attachmentsTable.message_id, messageIds))

				return rows as AttachmentRecord[]
			},
		)
	}
}
