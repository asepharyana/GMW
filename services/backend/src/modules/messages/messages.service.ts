import { NotFoundError, ValidationError } from "@bete/shared/errors";
import { createChildLogger } from "@bete/shared/logger";
import { messagesRepository } from "./messages.repository.js";
import type { MessageQuery } from "./messages.schema.js";

const logger = createChildLogger("messages.service");

export class MessagesService {
  async listMessages(query: MessageQuery) {
    if (!query.channelId && !query.guildId) {
      throw new ValidationError("Either channelId or guildId is required");
    }

    logger.debug({ query }, "Listing messages");
    return messagesRepository.findMany(query);
  }

  async getMessagesByChannel(channelId: string, query: MessageQuery) {
    if (!channelId) {
      throw new ValidationError("channelId is required");
    }

    logger.debug({ channelId, query }, "Getting messages by channel");
    return messagesRepository.findByChannel(channelId, query);
  }

  async getMessageById(id: string) {
    if (!id) {
      throw new ValidationError("message ID is required");
    }

    const message = await messagesRepository.findById(id);
    if (!message) {
      throw new NotFoundError(`Message with ID ${id} not found`);
    }

    return message;
  }

  async getAttachmentsByChannel(channelId: string, query: MessageQuery) {
    if (!channelId) {
      throw new ValidationError("channelId is required");
    }

    logger.debug({ channelId, query }, "Getting attachments by channel");
    return messagesRepository.getAttachmentsByChannel(channelId, query);
  }

  async markForReanalysis(id: string): Promise<void> {
    if (!id) {
      throw new ValidationError("message ID is required");
    }

    logger.debug({ id }, "Marking message for re-analysis");
    await messagesRepository.markForReanalysis(id);
  }

  async getReviewMessages(
    channelId?: string,
    limit?: number,
  ): Promise<Record<string, unknown>[]> {
    logger.debug({ channelId, limit }, "Getting review messages");
    return messagesRepository.getReviewMessages(channelId, limit);
  }

  async reanalyzeErrorBatch(opts: {
    guildId?: string;
    channelId?: string;
    messageIds?: string[];
  }) {
    if (
      !opts.guildId &&
      !opts.channelId &&
      (!opts.messageIds || opts.messageIds.length === 0)
    ) {
      throw new ValidationError(
        "At least one of guildId, channelId, or messageIds[] is required",
      );
    }

    logger.info(opts, "Batch reanalyzing errored messages");
    return messagesRepository.reanalyzeErrorBatch(opts);
  }
}

export const messagesService = new MessagesService();
