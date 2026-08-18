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

  async getTopFlaggedDomains(days = 30) {
    return moderationRepository.getTopFlaggedDomains(days);
  }

  async getTopFlaggedChannels(days = 30) {
    return moderationRepository.getTopFlaggedChannels(days);
  }

  async getHourlyModeration(days = 30) {
    return moderationRepository.getHourlyModeration(days);
  }

  async getByCategory(days = 30, category: string) {
    return moderationRepository.getByCategory(days, category);
  }

  async getCoverage(days = 30) {
    return moderationRepository.getCoverage(days);
  }

  async listActions(query: ListModerationQuery) {
    logger.debug({ query }, "Listing moderation actions");
    return moderationRepository.listActions(query);
  }
}

export const moderationService = new ModerationService();
