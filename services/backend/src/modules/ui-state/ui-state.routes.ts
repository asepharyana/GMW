import { createChildLogger } from "@bete/shared/logger";
import type { Request, Response, Router } from "express";
import express from "express";
import { asyncHandler } from "../../shared/middlewares/index.js";
import { uiStateService } from "./ui-state.service.js";

const logger = createChildLogger("ui-state.routes");

// Allowed UI state keys — reject any update that does not match these.
const ALLOWED_KEYS = new Set([
  "activeTab",
  "selectedVoiceGuild",
  "selectedVoiceChannel",
  "selectedTextChannel",
  "sidebarCollapsed",
]);

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
      // Filter to only allow known safe keys
      const filtered: Record<string, unknown> = {};
      for (const key of Object.keys(updates)) {
        if (ALLOWED_KEYS.has(key)) {
          filtered[key] = updates[key];
        }
      }
      const result = await uiStateService.updateState(filtered);
      res.json(result);
    }),
  );

  return router;
}
