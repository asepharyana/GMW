import { NotFoundError, ValidationError } from "../../domain/errors/index.js"
import type { MessageQuery } from "../../domain/messages/message-contracts.js"
import { createChildLogger } from "../../infrastructure/logger/index.js"
import type {
	EditPageResult,
	MessagesRepository,
	ReviewPageResult,
} from "../../infrastructure/repositories/messages.repository.js"

const logger = createChildLogger("messages.service")

export class MessagesService {
	constructor(private readonly repository: MessagesRepository) {}

	async listMessages(
		query: MessageQuery,
	): Promise<Awaited<ReturnType<MessagesRepository["findMany"]>>> {
		if (!query.channelId && !query.guildId) {
			throw new ValidationError("Either channelId or guildId is required")
		}

		logger.debug({ query }, "Listing messages")
		return this.repository.findMany(query)
	}

	/**
	 * Stream messages one at a time (no 50-row batch). The WS handler iterates
	 * this generator and emits one `message_snapshot` frame per message.
	 */
	streamMessages(query: MessageQuery, pageSize = 50) {
		return this.repository.streamMany(query, pageSize)
	}

	async getMessagesByChannel(
		channelId: string,
		query: MessageQuery,
	): Promise<Awaited<ReturnType<MessagesRepository["findByChannel"]>>> {
		if (!channelId) {
			throw new ValidationError("channelId is required")
		}

		logger.debug({ channelId, query }, "Getting messages by channel")
		return this.repository.findByChannel(channelId, query)
	}

	async getMessageById(id: string): Promise<
		NonNullable<Awaited<ReturnType<MessagesRepository["findById"]>>> & {
			edit_count: number
			edit_history: Awaited<ReturnType<MessagesRepository["getEditHistory"]>>
			/**
			 * Every analysis attempt, oldest first. Present so the detail view can
			 * explain a message that never got a verdict — that message has no row
			 * in `verdicts`, so without this the failure is invisible in the UI.
			 */
			analysis_attempts: Awaited<
				ReturnType<MessagesRepository["getAnalysisAttempts"]>
			>
		}
	> {
		if (!id) {
			throw new ValidationError("message ID is required")
		}

		const [message, editHistory, analysisAttempts] = await Promise.all([
			this.repository.findById(id),
			this.repository.getEditHistory(id),
			this.repository.getAnalysisAttempts(id),
		])

		if (!message) {
			throw new NotFoundError(`Message with ID ${id} not found`)
		}

		return {
			...message,
			edit_count: editHistory.length,
			edit_history: editHistory,
			analysis_attempts: analysisAttempts,
		}
	}

	async getAttachmentsByChannel(
		channelId: string,
		query: MessageQuery,
	): Promise<
		Awaited<ReturnType<MessagesRepository["getAttachmentsByChannel"]>>
	> {
		if (!channelId) {
			throw new ValidationError("channelId is required")
		}

		logger.debug({ channelId, query }, "Getting attachments by channel")
		return this.repository.getAttachmentsByChannel(channelId, query)
	}

	async getImageMessages(
		guildId: string,
		limit?: number,
		cursor?: string,
	): Promise<ReturnType<MessagesRepository["getImageMessages"]>> {
		if (!guildId) {
			throw new ValidationError("guildId is required")
		}

		logger.debug({ guildId, limit }, "Getting image messages")
		return this.repository.getImageMessages(guildId, limit, cursor)
	}

	async getReviewMessages(
		channelId?: string,
		limit?: number,
		cursor?: string,
	): Promise<ReviewPageResult> {
		logger.debug({ channelId, limit, cursor }, "Getting review messages")
		return this.repository.getReviewMessages(channelId, limit, cursor)
	}

	async getRecentEdits(
		limit = 50,
		channelId?: string,
		cursor?: string,
	): Promise<EditPageResult> {
		logger.debug({ limit, channelId, cursor }, "Getting recent message edits")
		return this.repository.getRecentEdits(limit, channelId, cursor)
	}

	/** Distinct guilds present in the message archive (guild picker). */
	async getGuilds(): Promise<
		Awaited<ReturnType<MessagesRepository["listGuilds"]>>
	> {
		return this.repository.listGuilds()
	}

	/** Text channels for a guild (channel picker). */
	async getTextChannels(
		guildId: string,
	): Promise<Awaited<ReturnType<MessagesRepository["listTextChannels"]>>> {
		return this.repository.listTextChannels(guildId)
	}
}
