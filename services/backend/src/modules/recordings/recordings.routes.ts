import { createChildLogger } from "@bete/shared/logger";
import type { Request, Response, Router } from "express";
import express from "express";
import { asyncHandler } from "../../shared/middlewares/index.js";
import { recordingsService } from "./recordings.service.js";

const logger = createChildLogger("recordings.routes");

export function createRecordingsRouter(): Router {
  const router = express.Router();

  // GET /api/recordings
  router.get(
    "/recordings",
    asyncHandler(async (req: Request, res: Response) => {
      const limit = Number(req.query.limit) || 50;
      const channelId = req.query.channelId as string | undefined;
      const userId = req.query.userId as string | undefined;
      const cursor = req.query.cursor as string | undefined;
      logger.debug({ limit, channelId, userId, cursor }, "Fetching recordings");
      const result = await recordingsService.getRecent(limit, {
        channelId,
        userId,
        cursor,
      });
      res.json(result);
    }),
  );

  // DELETE /api/recordings/:id
  router.delete(
    "/recordings/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const id = req.params.id as string;
      await recordingsService.deleteById(id);
      res.json({ ok: true });
    }),
  );

  return router;
}
