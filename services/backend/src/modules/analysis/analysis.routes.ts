import type { Request, Response, Router } from "express";
import express from "express";
import { createChildLogger } from "@bete/shared/logger";
import { asyncHandler } from "../../shared/middlewares/index.js";
import { analysisService } from "./analysis.service.js";

const logger = createChildLogger("analysis.routes");

export function createAnalysisRouter(): Router {
  const router = express.Router();

  // GET /api/analysis/search
  router.get(
    "/analysis/search",
    asyncHandler(async (req: Request, res: Response) => {
      const q = (req.query.q as string) || "";
      const channelId = (req.query.channelId as string) || undefined;
      const limit = Number(req.query.limit) || 20;

      logger.debug({ q, channelId, limit }, "Analysis search requested");
      const result = await analysisService.search({ q, channelId, limit });
      res.json(result);
    }),
  );

  return router;
}
