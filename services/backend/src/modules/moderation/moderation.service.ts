import { createChildLogger } from "../../shared/logger/index.js";
import {
  type ListModerationQuery,
  moderationRepository,
} from "./moderation.repository.js";

const logger = createChildLogger("moderation.service");

export class ModerationService {
  async getStats() {
    return moderationRepository.getStats();
  }

  async getTrends(days = 30) {
    return moderationRepository.getTrends(days);
  }

  async listActions(query: ListModerationQuery) {
    logger.debug({ query }, "Listing moderation actions");
    return moderationRepository.listActions(query);
  }
}

export const moderationService = new ModerationService();
