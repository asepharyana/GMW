import { NotFoundError, ValidationError } from "@/shared/errors/index";
import { createChildLogger } from "@/shared/logger/index";
import { embedQuery } from "./embed.js";
import { messagesRepository } from "./messages.repository.js";
import type { MessageQuery, SemanticSearchQuery } from "./messages.schema.js";
import { searchArchive } from "./qdrant.js";

const logger = createChildLogger("messages.service");

export class MessagesService {
  async listMessages(query: MessageQuery) {
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

  /**
   * Public, read-only semantic search over the persistent message archive.
   * Embeds the query, searches Qdrant, returns text + metadata. Best-effort:
   * if embeddings/Qdrant are unavailable, returns an empty result set.
   */
  async semanticSearch(
    input: SemanticSearchQuery,
  ): Promise<{ results: ReturnType<typeof mapSearchHit>[]; nextCursor: null }> {
    const vector = await embedQuery(input.query);
    if (!vector) {
      logger.debug(
        { query: input.query },
        "semantic search skipped: no embedder",
      );
      return { results: [], nextCursor: null };
    }
    const hits = await searchArchive(vector, input.limit, 0.6);
    const results = hits.map((h) => mapSearchHit(h));
    return { results, nextCursor: null };
  }
}

/** Shape returned to the frontend (text + metadata from the archive payload). */
function mapSearchHit(hit: {
  score: number;
  payload: { text: string; content_hash?: string; analyzed_at: number };
}) {
  return {
    message_id: hit.payload.content_hash ?? null,
    content: hit.payload.text,
    score: hit.score,
    created_at: hit.payload.analyzed_at,
  };
}

export const messagesService = new MessagesService();
