import { createChildLogger } from "@bete/shared/logger";
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

  async listUsers(query: ListUsersQuery) {
    logger.debug({ query }, "Listing dashboard users");
    return dashboardRepository.listUsers(query);
  }

  async getUserDetail(userId: string) {
    logger.debug({ userId }, "Fetching user detail");
    return dashboardRepository.getUserDetail(userId);
  }
}

export const dashboardService = new DashboardService();
