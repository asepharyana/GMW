import { createChildLogger } from "../../shared/logger/index.js";
import { knowledgeRepository } from "./knowledge.repository.js";

const logger = createChildLogger("knowledge.service");

export class KnowledgeService {
  async listChannelCultures(limit = 50, search?: string) {
    logger.debug({ limit, search }, "Listing channel cultures");
    return knowledgeRepository.listChannelCultures(limit, search);
  }

  async listGlossary(limit = 50, search?: string) {
    logger.debug({ limit, search }, "Listing glossary terms");
    return knowledgeRepository.listGlossary(limit, search);
  }
}

export const knowledgeService = new KnowledgeService();
