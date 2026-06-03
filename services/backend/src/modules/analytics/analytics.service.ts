import { ForbiddenError, ValidationError } from "@bete/shared/errors";
import { createChildLogger } from "@bete/shared/logger";
import { config } from "../../shared/config/index.js";
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

  async getHourlyStats(guildId: string, channelId?: string, hours = 24) {
    this.assertMonitorGuild(guildId);
    logger.debug({ guildId, channelId, hours }, "Getting hourly stats");
    return analyticsRepository.getHourlyStats(guildId, channelId, hours);
  }

  async getTopViolators(
    guildId: string,
    channelId?: string,
    hours = 24,
    limit = 10,
  ) {
    this.assertMonitorGuild(guildId);
    logger.debug({ guildId, channelId, hours, limit }, "Getting top violators");
    return analyticsRepository.getTopViolators(
      guildId,
      channelId,
      hours,
      limit,
    );
  }

  async getUserLeaderboard(
    guildId: string,
    channelId?: string,
    hours = 24,
    limit = 10,
  ) {
    this.assertMonitorGuild(guildId);
    logger.debug(
      { guildId, channelId, hours, limit },
      "Getting user leaderboard",
    );
    return analyticsRepository.getUserLeaderboard(
      guildId,
      channelId,
      hours,
      limit,
    );
  }

  async getModerationStats(guildId: string, channelId?: string, hours = 24) {
    this.assertMonitorGuild(guildId);
    logger.debug({ guildId, channelId, hours }, "Getting moderation stats");
    return analyticsRepository.getModerationStats(guildId, channelId, hours);
  }

  async getHeatmap(guildId: string, channelId?: string, hours = 24) {
    this.assertMonitorGuild(guildId);
    logger.debug({ guildId, channelId, hours }, "Getting heatmap");
    return analyticsRepository.getHeatmap(guildId, channelId, hours);
  }

  async getTopics(guildId: string, channelId?: string, hours = 24) {
    this.assertMonitorGuild(guildId);
    logger.debug({ guildId, channelId, hours }, "Getting topics");
    return analyticsRepository.getTopics(guildId, channelId, hours);
  }

  async getModerationActions(
    guildId: string,
    channelId?: string,
    hours = 24,
    limit = 20,
  ) {
    this.assertMonitorGuild(guildId);
    logger.debug(
      { guildId, channelId, hours, limit },
      "Getting moderation actions",
    );
    return analyticsRepository.getModerationActions(
      guildId,
      channelId,
      hours,
      limit,
    );
  }

  async getAIStats(guildId: string, channelId?: string, hours = 24) {
    this.assertMonitorGuild(guildId);
    logger.debug({ guildId, channelId, hours }, "Getting AI stats");
    return analyticsRepository.getAIStats(guildId, channelId, hours);
  }

  async getAttachmentStats(guildId: string, channelId?: string, hours = 24) {
    this.assertMonitorGuild(guildId);
    logger.debug({ guildId, channelId, hours }, "Getting attachment stats");
    return analyticsRepository.getAttachmentStats(guildId, channelId, hours);
  }
}

export const analyticsService = new AnalyticsService();
