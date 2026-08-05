import type { Request, Response, Router } from "express";
import express from "express";
import { createChildLogger } from "@/shared/logger/index";
import { asyncHandler } from "../../shared/middlewares/index.js";
import { dashboardService } from "./dashboard.service.js";

const logger = createChildLogger("dashboard.routes");

export function createDashboardRouter(): Router {
  const router = express.Router();

  // GET /api/dashboard/stats — aggregated server statistics
  router.get(
    "/dashboard/stats",
    asyncHandler(async (_req: Request, res: Response) => {
      logger.debug("Fetching dashboard stats");
      const stats = await dashboardService.getStats();
      res.json(stats);
    }),
  );

  // GET /api/dashboard/activity?days=14 — message volume over time
  router.get(
    "/dashboard/activity",
    asyncHandler(async (req: Request, res: Response) => {
      const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 90);
      const activity = await dashboardService.getActivity(days);
      res.json(activity);
    }),
  );

  // GET /api/dashboard/users — paginated user list with profiles
  router.get(
    "/dashboard/users",
    asyncHandler(async (req: Request, res: Response) => {
      const limit = Number(req.query.limit) || 20;
      const cursor =
        typeof req.query.cursor === "string" ? req.query.cursor : undefined;
      const search =
        typeof req.query.search === "string" ? req.query.search : undefined;

      const result = await dashboardService.listUsers({
        limit,
        cursor,
        search,
      });
      res.json(result);
    }),
  );

  // GET /api/dashboard/users/:userId — single user detail
  router.get(
    "/dashboard/users/:userId",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = String(req.params.userId);
      const detail = await dashboardService.getUserDetail(userId);
      res.json(detail);
    }),
  );

  // GET /api/dashboard/channels — paginated channel list with culture summaries
  router.get(
    "/dashboard/channels",
    asyncHandler(async (req: Request, res: Response) => {
      const limit = Number(req.query.limit) || 20;
      const search =
        typeof req.query.search === "string" ? req.query.search : undefined;
      const guildId =
        typeof req.query.guild_id === "string" ? req.query.guild_id : undefined;

      const result = await dashboardService.listChannels({
        limit,
        search,
        guildId,
      });
      res.json(result);
    }),
  );

  // GET /api/dashboard/channels/:channelId — single channel detail
  router.get(
    "/dashboard/channels/:channelId",
    asyncHandler(async (req: Request, res: Response) => {
      const channelId = String(req.params.channelId);
      const detail = await dashboardService.getChannelDetail(channelId);
      res.json(detail);
    }),
  );

  // GET /api/dashboard/reactions — top reacted messages
  router.get(
    "/dashboard/reactions",
    asyncHandler(async (req: Request, res: Response) => {
      const limit = Number(req.query.limit) || 20;
      const reactions = await dashboardService.getTopReactions(limit);
      res.json(reactions);
    }),
  );

  return router;
}
