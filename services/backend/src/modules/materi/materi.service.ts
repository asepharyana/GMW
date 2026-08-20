import type { MateriDocument } from "@/shared/database/schema.js";
import { createChildLogger } from "@/shared/logger/index.js";
import { materiRepository } from "./materi.repository.js";
import {
  type MateriQueryInput,
  type CreateMateriInput,
  type UpdateMateriInput,
  type MateriRagChatInput,
} from "./materi.schema.js";
import { ragChat } from "./ragClient.js";

const logger = createChildLogger("materi.service");

export class MateriService {
  /** List materi documents with optional filtering. */
  async list(input: MateriQueryInput): Promise<MateriDocument[]> {
    logger.debug({ limit: input.limit, search: input.search }, "Listing materi");
    return materiRepository.list(input);
  }

  /** Get a single materi document by ID, incrementing view count. */
  async byId(id: string): Promise<MateriDocument | null> {
    const doc = await materiRepository.byId(id);
    if (doc) {
      void materiRepository.incrementViews(id);
    }
    return doc;
  }

  /** Create a new materi document. */
  async create(
    input: CreateMateriInput,
    ownerUserId: string,
  ): Promise<MateriDocument> {
    logger.info({ title: input.title, ownerUserId }, "Creating materi");
    return materiRepository.create({
      title: input.title,
      description: input.description,
      content: input.content,
      category: input.category,
      tags: input.tags,
      ownerUserId,
      guildId: input.guildId ?? null,
      channelId: input.channelId ?? null,
      isPublic: input.isPublic,
    });
  }

  /** Update an existing materi document. */
  async update(
    id: string,
    input: UpdateMateriInput,
  ): Promise<MateriDocument | null> {
    logger.info({ id, keys: Object.keys(input) }, "Updating materi");
    return materiRepository.update(id, {
      title: input.title,
      description: input.description,
      content: input.content,
      category: input.category,
      tags: input.tags,
      isPublic: input.isPublic,
    });
  }

  /** Delete a materi document. */
  async delete(id: string): Promise<boolean> {
    logger.info({ id }, "Deleting materi");
    return materiRepository.delete(id);
  }

  /** RAG chat: answer a question using materi documents as context. */
  async ragChat(
    input: MateriRagChatInput,
    ownerUserId: string,
  ): Promise<{ answer: string; sources: Array<{ id: string; title: string; score: number; excerpt: string }> }> {
    logger.info({ ownerUserId, hasMateriId: !!input.materiId }, "RAG chat");

    // Fetch relevant materi documents
    let documents: MateriDocument[];
    if (input.materiId) {
      const doc = await materiRepository.byId(input.materiId);
      documents = doc ? [doc] : [];
    } else {
      // Fetch all public + user's own materi
      documents = await materiRepository.list({
        limit: 100,
        onlyPublic: true,
        ownerId: ownerUserId,
      });
    }

    const result = await ragChat(input.message, documents, input.history);
    return {
      answer: result.answer,
      sources: result.sources,
    };
  }
}

export const materiService = new MateriService();
