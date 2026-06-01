import { NotFoundError, ValidationError } from "../../shared/errors/index.js";
import { createChildLogger } from "../../shared/logger/index.js";
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
}

export const messagesService = new MessagesService();
