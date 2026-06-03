import type { Router } from "express";
import express from "express";
import {
  handleGetAIStats,
  handleGetAttachmentStats,
  handleGetDailyTrend,
  handleGetHeatmap,
  handleGetHourlyStats,
  handleGetModerationActions,
  handleGetModerationStats,
  handleGetOverview,
  handleGetTopViolators,
  handleGetTopics,
  handleGetUserLeaderboard,
} from "./analytics.controller.js";

export function createAnalyticsRouter(): Router {
  const router = express.Router();

  router.get("/analytics/overview", handleGetOverview);
  router.get("/analytics/trend", handleGetDailyTrend);
  router.get("/analytics/hourly", handleGetHourlyStats);
  router.get("/analytics/violators", handleGetTopViolators);
  router.get("/analytics/leaderboard", handleGetUserLeaderboard);
  router.get("/analytics/stats", handleGetModerationStats);
  router.get("/analytics/heatmap", handleGetHeatmap);
  router.get("/analytics/topics", handleGetTopics);
  router.get("/analytics/moderation-actions", handleGetModerationActions);
  router.get("/analytics/ai-stats", handleGetAIStats);
  router.get("/analytics/attachment-stats", handleGetAttachmentStats);

  return router;
}
