import type { Request, Response, Router } from "express";
import express from "express";
import { createChildLogger } from "../../shared/logger/index.js";
import { asyncHandler } from "../../shared/middlewares/index.js";
import { moderationService } from "./moderation.service.js";

const logger = createChildLogger("moderation.routes");

export function createModerationRouter(): Router {
  const router = express.Router();

  // GET /api/moderation/stats — moderation action summary
  router.get(
    "/moderation/stats",
    asyncHandler(async (_req: Request, res: Response) => {
      const stats = await moderationService.getStats();
      res.json(stats);
    }),
  );

  // GET /api/moderation/actions — paginated moderation action log
  router.get(
    "/moderation/actions",
    asyncHandler(async (req: Request, res: Response) => {
      const limit = Number(req.query.limit) || 50;
      const status = req.query.status as string | undefined;
      const actionType = req.query.actionType as string | undefined;
      const cursor = req.query.cursor as string | undefined;

      const result = await moderationService.listActions({
        limit,
        status,
        actionType,
        cursor: cursor ? Number(cursor) : undefined,
      });

      logger.debug({ count: result.data.length }, "Moderation actions listed");
      res.json(result);
    }),
  );

  return router;
}
