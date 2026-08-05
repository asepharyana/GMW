import { NotFoundError, ValidationError } from "@/shared/errors/index";
import { createChildLogger } from "@/shared/logger/index";
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

    const editHistory = await messagesRepository.getEditHistory(id);
    return {
      ...message,
      edit_count: editHistory.length,
      edit_history: editHistory,
    };
  }

  async getAttachmentsByChannel(channelId: string, query: MessageQuery) {
    if (!channelId) {
      throw new ValidationError("channelId is required");
    }

    logger.debug({ channelId, query }, "Getting attachments by channel");
    return messagesRepository.getAttachmentsByChannel(channelId, query);
  }

  async getImageMessages(
    guildId: string,
    limit?: number,
  ): Promise<ReturnType<typeof messagesRepository.getImageMessages>> {
    if (!guildId) {
      throw new ValidationError("guildId is required");
    }

    logger.debug({ guildId, limit }, "Getting image messages");
    return messagesRepository.getImageMessages(guildId, limit);
  }

  async getReviewMessages(
    channelId?: string,
    limit?: number,
  ): Promise<Record<string, unknown>[]> {
    logger.debug({ channelId, limit }, "Getting review messages");
    return messagesRepository.getReviewMessages(channelId, limit);
  }
}

export const messagesService = new MessagesService();
