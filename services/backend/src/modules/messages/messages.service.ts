import { NotFoundError, ValidationError } from "@/shared/errors/index";
import { createChildLogger } from "@/shared/logger/index";
import { type MessageRow, messagesRepository } from "./messages.repository.js";
import type { MessageQuery } from "./messages.schema.js";

const logger = createChildLogger("messages.service");

export class MessagesService {
  async listMessages(
    query: MessageQuery,
  ): Promise<Awaited<ReturnType<typeof messagesRepository.findMany>>> {
    if (!query.channelId && !query.guildId) {
      throw new ValidationError("Either channelId or guildId is required");
    }

    logger.debug({ query }, "Listing messages");
    return messagesRepository.findMany(query);
  }

  /**
   * Stream messages one at a time (no 50-row batch). The WS handler iterates
   * this generator and emits one `message_snapshot` frame per message.
   */
  streamMessages(query: MessageQuery, pageSize = 50) {
    return messagesRepository.streamMany(query, pageSize);
  }

  async getMessagesByChannel(
    channelId: string,
    query: MessageQuery,
  ): Promise<Awaited<ReturnType<typeof messagesRepository.findByChannel>>> {
    if (!channelId) {
      throw new ValidationError("channelId is required");
    }

    logger.debug({ channelId, query }, "Getting messages by channel");
    return messagesRepository.findByChannel(channelId, query);
  }

  async getMessageById(id: string): Promise<
    NonNullable<Awaited<ReturnType<typeof messagesRepository.findById>>> & {
      edit_count: number;
      edit_history: Awaited<
        ReturnType<typeof messagesRepository.getEditHistory>
      >;
    }
  > {
    if (!id) {
      throw new ValidationError("message ID is required");
    }

    const [message, editHistory] = await Promise.all([
      messagesRepository.findById(id),
      messagesRepository.getEditHistory(id),
    ]);

    if (!message) {
      throw new NotFoundError(`Message with ID ${id} not found`);
    }

    return {
      ...message,
      edit_count: editHistory.length,
      edit_history: editHistory,
    };
  }

  async getAttachmentsByChannel(
    channelId: string,
    query: MessageQuery,
  ): Promise<
    Awaited<ReturnType<typeof messagesRepository.getAttachmentsByChannel>>
  > {
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

  async getActivity(
    days = 30,
  ): Promise<Awaited<ReturnType<typeof messagesRepository.getActivity>>> {
    return messagesRepository.getActivity(days);
  }

  async getRecentEdits(
    limit = 50,
    channelId?: string,
  ): Promise<Awaited<ReturnType<typeof messagesRepository.getRecentEdits>>> {
    logger.debug({ limit, channelId }, "Getting recent message edits");
    return messagesRepository.getRecentEdits(limit, channelId);
  }

  /** Distinct guilds present in the message archive (guild picker). */
  async getGuilds(): Promise<
    Awaited<ReturnType<typeof messagesRepository.listGuilds>>
  > {
    return messagesRepository.listGuilds();
  }

  /** Text channels for a guild (channel picker). */
  async getTextChannels(
    guildId: string,
  ): Promise<Awaited<ReturnType<typeof messagesRepository.listTextChannels>>> {
    return messagesRepository.listTextChannels(guildId);
  }
}

export const messagesService = new MessagesService();
