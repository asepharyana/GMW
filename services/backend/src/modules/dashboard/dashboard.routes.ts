import { createChildLogger } from "@bete/shared/logger";
import type { Request, Response, Router } from "express";
import express from "express";
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

  return router;
}
