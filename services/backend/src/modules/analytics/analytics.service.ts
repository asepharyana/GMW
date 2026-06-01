import { config } from "../../shared/config/index.js";
import { ForbiddenError, ValidationError } from "../../shared/errors/index.js";
import { createChildLogger } from "../../shared/logger/index.js";
import { analyticsRepository } from "./analytics.repository.js";
import type { AnalyticsQuery } from "./analytics.schema.js";

const logger = createChildLogger("analytics.service");

export class AnalyticsService {
  private assertMonitorGuild(guildId: string) {
    if (!config.MONITOR_GUILD_ID) {
      throw new ValidationError("MONITOR_GUILD_ID is not configured");
    }

    if (guildId !== config.MONITOR_GUILD_ID) {
      throw new ForbiddenError("Analytics are restricted to the monitor guild");
    }
  }

  async getOverview(query: AnalyticsQuery) {
    this.assertMonitorGuild(query.guildId);
    logger.debug({ query }, "Getting analytics overview");
    return analyticsRepository.getOverview(
      query.guildId,
      query.channelId,
      query.hours,
    );
  }

  async getDailyTrend(guildId: string, hours = 24) {
    this.assertMonitorGuild(guildId);
    logger.debug({ guildId, hours }, "Getting daily trend");
    return analyticsRepository.getDailyTrend(guildId, hours);
  }

  async getHourlyStats(guildId: string, hours = 24) {
    this.assertMonitorGuild(guildId);
    logger.debug({ guildId, hours }, "Getting hourly stats");
    return analyticsRepository.getHourlyStats(guildId, hours);
  }

  async getTopViolators(guildId: string, limit = 10) {
    this.assertMonitorGuild(guildId);
    logger.debug({ guildId, limit }, "Getting top violators");
    return analyticsRepository.getTopViolators(guildId, limit);
  }

  async getUserLeaderboard(guildId: string, limit = 10) {
    this.assertMonitorGuild(guildId);
    logger.debug({ guildId, limit }, "Getting user leaderboard");
    return analyticsRepository.getUserLeaderboard(guildId, limit);
  }

  async getModerationStats(guildId: string) {
    this.assertMonitorGuild(guildId);
    logger.debug({ guildId }, "Getting moderation stats");
    return analyticsRepository.getModerationStats(guildId);
  }
}

export const analyticsService = new AnalyticsService();
