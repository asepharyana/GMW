import type { Router } from "express";
import express from "express";
import { config } from "../config.js";
import { AppError } from "../errors.js";
import {
  getActivityHeatmap,
  getAnalyticsOverview,
  getDailyTrend,
  getHourlyStats,
  getModerationStats,
  getTopicTrends,
  getTopViolators,
  getUserLeaderboard,
} from "../moderation/analyticsStore.js";

export function createAnalyticsRoutes(): Router {
  const router = express.Router();

  function assertMonitorGuild(guildId?: string): string {
    if (!config.MONITOR_GUILD_ID) {
      throw new AppError(
        "MONITOR_GUILD_ID is required for analytics",
        "MISSING_MONITOR_GUILD_ID",
        400,
      );
    }

    if (guildId && guildId !== config.MONITOR_GUILD_ID) {
      throw new AppError(
        "Analytics are restricted to the monitor guild",
        "INVALID_GUILD",
        403,
      );
    }

    return config.MONITOR_GUILD_ID;
  }

  // GET /api/analytics/overview - Full analytics dashboard data
  // Query params: guildId (required), channelId, hours (default 24)
  router.get("/analytics/overview", async (req, res, next) => {
    try {
      const { guildId, channelId, hours } = req.query as {
        guildId?: string;
        channelId?: string;
        hours?: string;
      };

      if (!guildId) {
        throw new AppError(
          "guildId query parameter is required",
          "MISSING_GUILD_ID",
          400,
        );
      }

      const hoursNum = hours ? Math.min(parseInt(hours) || 24, 168) : 24;
      const monitorGuildId = assertMonitorGuild(guildId);

      const overview = await getAnalyticsOverview({
        guildId: monitorGuildId,
        channelId,
        hours: hoursNum,
      });

      res.json(overview);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/analytics/hourly - Hourly message stats
  // Query params: guildId (required), channelId, hours (default 24)
  router.get("/analytics/hourly", async (req, res, next) => {
    try {
      const { guildId, channelId, hours } = req.query as {
        guildId?: string;
        channelId?: string;
        hours?: string;
      };

      if (!guildId) {
        throw new AppError(
          "guildId query parameter is required",
          "MISSING_GUILD_ID",
          400,
        );
      }

      const hoursNum = hours ? Math.min(parseInt(hours) || 24, 168) : 24;
      const monitorGuildId = assertMonitorGuild(guildId);

      const stats = await getHourlyStats({
        guildId: monitorGuildId,
        channelId,
        hours: hoursNum,
      });

      res.json(stats);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/analytics/topics - Topic trends
  // Query params: guildId (required), channelId, hours (default 24)
  router.get("/analytics/topics", async (req, res, next) => {
    try {
      const { guildId, channelId, hours } = req.query as {
        guildId?: string;
        channelId?: string;
        hours?: string;
      };

      if (!guildId) {
        throw new AppError(
          "guildId query parameter is required",
          "MISSING_GUILD_ID",
          400,
        );
      }

      const hoursNum = hours ? Math.min(parseInt(hours) || 24, 168) : 24;
      const monitorGuildId = assertMonitorGuild(guildId);

      const topics = await getTopicTrends({
        guildId: monitorGuildId,
        channelId,
        hours: hoursNum,
      });

      res.json(topics);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/analytics/leaderboard - User leaderboard
  // Query params: guildId (required), channelId, hours (default 24), limit (default 20)
  router.get("/analytics/leaderboard", async (req, res, next) => {
    try {
      const { guildId, channelId, hours, limit } = req.query as {
        guildId?: string;
        channelId?: string;
        hours?: string;
        limit?: string;
      };

      if (!guildId) {
        throw new AppError(
          "guildId query parameter is required",
          "MISSING_GUILD_ID",
          400,
        );
      }

      const hoursNum = hours ? Math.min(parseInt(hours) || 24, 168) : 24;
      const limitNum = limit ? Math.min(parseInt(limit) || 20, 100) : 20;
      const monitorGuildId = assertMonitorGuild(guildId);

      const users = await getUserLeaderboard({
        guildId: monitorGuildId,
        channelId,
        hours: hoursNum,
        limit: limitNum,
      });

      res.json(users);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/analytics/stats - Moderation stats breakdown
  // Query params: guildId (required), channelId, hours (default 24)
  router.get("/analytics/stats", async (req, res, next) => {
    try {
      const { guildId, channelId, hours } = req.query as {
        guildId?: string;
        channelId?: string;
        hours?: string;
      };

      if (!guildId) {
        throw new AppError(
          "guildId query parameter is required",
          "MISSING_GUILD_ID",
          400,
        );
      }

      const hoursNum = hours ? Math.min(parseInt(hours) || 24, 168) : 24;
      const monitorGuildId = assertMonitorGuild(guildId);

      const stats = await getModerationStats({
        guildId: monitorGuildId,
        channelId,
        hours: hoursNum,
      });

      res.json(stats);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/analytics/violators - Top violators leaderboard
  // Query params: guildId (required), channelId, hours (default 24), limit (default 20)
  router.get("/analytics/violators", async (req, res, next) => {
    try {
      const { guildId, channelId, hours, limit } = req.query as {
        guildId?: string;
        channelId?: string;
        hours?: string;
        limit?: string;
      };

      if (!guildId) {
        throw new AppError(
          "guildId query parameter is required",
          "MISSING_GUILD_ID",
          400,
        );
      }

      const hoursNum = hours ? Math.min(parseInt(hours) || 24, 168) : 24;
      const limitNum = limit ? Math.min(parseInt(limit) || 20, 100) : 20;
      const monitorGuildId = assertMonitorGuild(guildId);

      const violators = await getTopViolators({
        guildId: monitorGuildId,
        channelId,
        hours: hoursNum,
        limit: limitNum,
      });

      res.json(violators);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/analytics/trend - Daily trend data (for line chart)
  // Query params: guildId (required), channelId, hours (default 168)
  router.get("/analytics/trend", async (req, res, next) => {
    try {
      const { guildId, channelId, hours } = req.query as {
        guildId?: string;
        channelId?: string;
        hours?: string;
      };

      if (!guildId) {
        throw new AppError(
          "guildId query parameter is required",
          "MISSING_GUILD_ID",
          400,
        );
      }

      const hoursNum = hours ? Math.min(parseInt(hours) || 168, 720) : 168;
      const monitorGuildId = assertMonitorGuild(guildId);

      const trend = await getDailyTrend({
        guildId: monitorGuildId,
        channelId,
        hours: hoursNum,
      });

      res.json(trend);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/analytics/heatmap - Activity heatmap (day × hour)
  // Query params: guildId (required), channelId, hours (default 168)
  router.get("/analytics/heatmap", async (req, res, next) => {
    try {
      const { guildId, channelId, hours } = req.query as {
        guildId?: string;
        channelId?: string;
        hours?: string;
      };

      if (!guildId) {
        throw new AppError(
          "guildId query parameter is required",
          "MISSING_GUILD_ID",
          400,
        );
      }

      const hoursNum = hours ? Math.min(parseInt(hours) || 168, 720) : 168;
      const monitorGuildId = assertMonitorGuild(guildId);

      const heatmap = await getActivityHeatmap({
        guildId: monitorGuildId,
        channelId,
        hours: hoursNum,
      });

      res.json(heatmap);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
