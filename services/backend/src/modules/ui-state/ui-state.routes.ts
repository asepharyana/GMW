import type { Request, Response, Router } from "express";
import express from "express";
import { createChildLogger } from "@/shared/logger/index";
import { asyncHandler } from "../../shared/middlewares/index.js";
import { uiStateService } from "./ui-state.service.js";

const logger = createChildLogger("ui-state.routes");

export function createUiStateRouter(): Router {
  const router = express.Router();

  // GET /api/ui-state
  router.get(
    "/ui-state",
    asyncHandler(async (_req: Request, res: Response) => {
      logger.debug("Fetching UI state");
      const state = await uiStateService.getState();
      res.json(state);
    }),
  );

  // POST /api/ui-state
  router.post(
    "/ui-state",
    asyncHandler(async (req: Request, res: Response) => {
      const updates = req.body as Record<string, unknown>;
      logger.debug({ keys: Object.keys(updates) }, "Updating UI state");
      const result = await uiStateService.updateState(updates);
      res.json(result);
    }),
  );

  return router;
}
