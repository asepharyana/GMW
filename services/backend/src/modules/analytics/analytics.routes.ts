import type { Router } from "express";
import express from "express";
import {
  handleGetDailyTrend,
  handleGetHeatmap,
  handleGetHourlyStats,
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

  return router;
}
