import { createChildLogger } from "@/shared/logger/index";
import type { Request, Response, Router } from "express";
import express from "express";
import { asyncHandler, validateBody } from "../../shared/middlewares/index.js";
import { mediaQueueSchema, mediaVolumeSchema } from "./media.schema.js";
import { getStatus, queue, setVolume, skip, stop } from "./media.service.js";

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
    validateBody(mediaQueueSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const { source, mode } = req.body as {
        source: string;
        mode: "music" | "screen";
      };
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
    validateBody(mediaVolumeSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const { volume } = req.body as { volume: number };
      logger.debug({ volume }, "Media volume requested");
      const state = await setVolume(volume);
      res.json(state);
    }),
  );

  return router;
}
