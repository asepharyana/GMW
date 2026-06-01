import type { Request, Response, Router } from "express";
import express from "express";
import { createChildLogger } from "../../shared/logger/index.js";
import { asyncHandler } from "../../shared/middlewares/index.js";
import { queue, skip, stop, setVolume, getStatus } from "./media.service.js";

const logger = createChildLogger("media.routes");

export function createMediaRouter(): Router {
  const router = express.Router();

  // GET /api/media/status
  router.get(
    "/media/status",
    asyncHandler(async (_req: Request, res: Response) => {
      logger.debug("Media status requested");
      const status = await getStatus();
      res.json(status);
    }),
  );

  // POST /api/media/queue
  router.post(
    "/media/queue",
    asyncHandler(async (req: Request, res: Response) => {
      const source = req.body?.source as string | undefined;
      if (!source) {
        res.status(400).json({
          error: "VALIDATION_ERROR",
          message: "source is required",
        });
        return;
      }
      const mode = (req.body?.mode as "music" | "screen") ?? "music";
      logger.debug({ source, mode }, "Media queue requested");
      const state = await queue(source, mode);
      res.json(state);
    }),
  );

  // POST /api/media/skip
  router.post(
    "/media/skip",
    asyncHandler(async (_req: Request, res: Response) => {
      logger.debug("Media skip requested");
      const state = await skip();
      res.json(state);
    }),
  );

  // POST /api/media/stop
  router.post(
    "/media/stop",
    asyncHandler(async (_req: Request, res: Response) => {
      logger.debug("Media stop requested");
      const state = await stop();
      res.json(state);
    }),
  );

  // POST /api/media/volume
  router.post(
    "/media/volume",
    asyncHandler(async (req: Request, res: Response) => {
      const volume = Number(req.body?.volume ?? 1.0);
      if (Number.isNaN(volume) || volume < 0 || volume > 1) {
        res.status(400).json({
          error: "VALIDATION_ERROR",
          message: "volume must be a number between 0 and 1",
        });
        return;
      }
      logger.debug({ volume }, "Media volume requested");
      const state = await setVolume(volume);
      res.json(state);
    }),
  );

  return router;
}
