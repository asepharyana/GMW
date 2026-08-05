import { createChildLogger } from "@/shared/logger/index";
import { dashboardRepository } from "./dashboard.repository.js";

const logger = createChildLogger("dashboard.service");

export interface ListUsersQuery {
  limit: number;
  cursor?: string;
  search?: string;
}

export class DashboardService {
  async getStats() {
    logger.debug("Fetching dashboard stats");
    return dashboardRepository.getStats();
  }

  async getActivity(days: number) {
    logger.debug({ days }, "Fetching dashboard activity");
    return dashboardRepository.getActivity(days);
  }

  async listUsers(query: ListUsersQuery) {
    logger.debug({ query }, "Listing dashboard users");
    return dashboardRepository.listUsers(query);
  }

  async getUserDetail(userId: string) {
    logger.debug({ userId }, "Fetching user detail");
    return dashboardRepository.getUserDetail(userId);
  }

  async listChannels(query: {
    limit: number;
    search?: string;
    guildId?: string;
  }) {
    logger.debug({ query }, "Listing dashboard channels");
    return dashboardRepository.listChannels(query);
  }

  async getChannelDetail(channelId: string) {
    logger.debug({ channelId }, "Fetching channel detail");
    return dashboardRepository.getChannelDetail(channelId);
  }

  async getTopReactions(limit: number) {
    logger.debug({ limit }, "Fetching top reactions");
    return dashboardRepository.getTopReactions(limit);
  }

  async getTopReactors(limit: number) {
    logger.debug({ limit }, "Fetching top reactors");
    return dashboardRepository.getTopReactors(limit);
  }
}

export const dashboardService = new DashboardService();
