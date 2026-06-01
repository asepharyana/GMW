import type { Request, Response, Router } from "express";
import express from "express";
import { createChildLogger } from "../../shared/logger/index.js";
import { asyncHandler } from "../../shared/middlewares/index.js";

const logger = createChildLogger("media.routes");

const stubResponse = {
  playing: false,
  musicVolume: 1.0,
  current: null,
  queue: [],
};

export function createMediaRouter(): Router {
  const router = express.Router();

  // GET /api/media/status
  router.get(
    "/media/status",
    asyncHandler(async (_req: Request, res: Response) => {
      logger.debug("Media status requested");
      res.json(stubResponse);
    }),
  );

  // POST /api/media/queue
  router.post(
    "/media/queue",
    asyncHandler(async (_req: Request, res: Response) => {
      logger.debug("Media queue requested (stub)");
      res.json(stubResponse);
    }),
  );

  // POST /api/media/skip
  router.post(
    "/media/skip",
    asyncHandler(async (_req: Request, res: Response) => {
      logger.debug("Media skip requested (stub)");
      res.json(stubResponse);
    }),
  );

  // POST /api/media/stop
  router.post(
    "/media/stop",
    asyncHandler(async (_req: Request, res: Response) => {
      logger.debug("Media stop requested (stub)");
      res.json(stubResponse);
    }),
  );

  // POST /api/media/volume
  router.post(
    "/media/volume",
    asyncHandler(async (_req: Request, res: Response) => {
      logger.debug("Media volume requested (stub)");
      res.json(stubResponse);
    }),
  );

  return router;
}
