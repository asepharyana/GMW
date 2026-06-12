import { createChildLogger } from "@bete/shared/logger";
import type { CorrectedModeration } from "@bete/shared";
import type { CorrectionCreate, CorrectionQuery } from "./corrections.schema.js";
import {
  correctionsRepository,
  type CorrectionStatsResult,
} from "./corrections.repository.js";

const logger = createChildLogger("corrections.service");

export class CorrectionsService {
  async getStats(): Promise<CorrectionStatsResult> {
    logger.debug("Fetching correction stats");
    return correctionsRepository.getStats();
  }

  async list(
    query: CorrectionQuery,
  ): Promise<{ data: CorrectedModeration[]; nextCursor: string | null }> {
    logger.debug({ limit: query.limit }, "Listing corrections");
    return correctionsRepository.list(query);
  }

  async create(data: CorrectionCreate): Promise<CorrectedModeration> {
    logger.debug(
      { messageId: data.message_id },
      "Creating correction",
    );
    return correctionsRepository.create(data);
  }
}

export const correctionsService = new CorrectionsService();
