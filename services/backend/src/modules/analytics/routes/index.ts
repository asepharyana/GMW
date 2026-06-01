import type { Router } from "express";
import express from "express";
import {
  handleGetDailyTrend,
  handleGetHourlyStats,
  handleGetModerationStats,
  handleGetOverview,
  handleGetTopViolators,
  handleGetUserLeaderboard,
} from "../analytics.controller.js";

export function createAnalyticsRouter(): Router {
  const router = express.Router();

  router.get("/analytics/overview", handleGetOverview);
  router.get("/analytics/daily-trend", handleGetDailyTrend);
  router.get("/analytics/hourly-stats", handleGetHourlyStats);
  router.get("/analytics/top-violators", handleGetTopViolators);
  router.get("/analytics/user-leaderboard", handleGetUserLeaderboard);
  router.get("/analytics/moderation-stats", handleGetModerationStats);

  return router;
}
