import { config } from "@/shared/config/index";
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
    const hits = await searchArchive(
      vector,
      input.limit,
      config.AI_LLM_EMBEDDING_ARCHIVE_MIN_SIMILARITY,
      input.guildId,
    );
    const results = hits.map((h) => mapSearchHit(h));
    return { results, nextCursor: null };
  }

  async getActivity(days = 30) {
    return messagesRepository.getActivity(days);
  }

  async getRecentEdits(limit = 50, channelId?: string) {
    logger.debug({ limit, channelId }, "Getting recent message edits");
    return messagesRepository.getRecentEdits(limit, channelId);
  }
}

/** Shape returned to the frontend (text + rich metadata from the archive payload). */
function mapSearchHit(hit: {
  score: number;
  payload: {
    text: string;
    content_hash?: string;
    analyzed_at: number;
    username?: string;
    channel_id?: string;
    guild_id?: string;
    thread_id?: string | null;
    channel_name?: string | null;
    thread_name?: string | null;
    created_at?: number;
  };
}) {
  return {
    message_id: hit.payload.content_hash ?? null,
    content: hit.payload.text,
    score: hit.score,
    // Prefer the real message timestamp; fall back to embed time for old
    // points that predate rich metadata.
    created_at: hit.payload.created_at ?? hit.payload.analyzed_at,
    username: hit.payload.username ?? null,
    channel_id: hit.payload.channel_id ?? null,
    guild_id: hit.payload.guild_id ?? null,
    thread_id: hit.payload.thread_id ?? null,
    channel_name: hit.payload.channel_name ?? null,
    thread_name: hit.payload.thread_name ?? null,
  };
}

export const messagesService = new MessagesService();
