import type { Request, Response, Router } from "express";
import express from "express";
import {
  getRuntimeSettings,
  updateRuntimeSettings,
} from "../../shared/config/runtime.js";
import { config } from "../../shared/config/index.js";
import { sessionAuth, asyncHandler } from "../../shared/middlewares/index.js";
import { createChildLogger } from "@bete/shared/logger";

const logger = createChildLogger("admin.routes");

export function createAdminRouter(): Router {
  const router = express.Router();

  // All admin routes require session-based auth
  router.use(sessionAuth(config.ADMIN_PASSWORD));

  // GET /api/admin/settings — read current runtime settings
  router.get(
    "/admin/settings",
    asyncHandler(async (_req: Request, res: Response) => {
      const settings = getRuntimeSettings();
      res.json({
        ...settings,
        envDashboardIsPublic: config.DASHBOARD_IS_PUBLIC,
      });
    }),
  );

  // PATCH /api/admin/settings — update runtime settings (live, no restart)
  router.patch(
    "/admin/settings",
    asyncHandler(async (req: Request, res: Response) => {
      const { dashboardIsPublic } = req.body as {
        dashboardIsPublic?: boolean;
      };

      const patch: Record<string, unknown> = {};
      if (typeof dashboardIsPublic === "boolean") {
        patch.dashboardIsPublic = dashboardIsPublic;
      }

      const updated = updateRuntimeSettings(patch);
      logger.info({ ...patch }, "Runtime settings updated");
      res.json(updated);
    }),
  );

  return router;
}
