import type { Request, Response, Router } from "express";
import express from "express";
import { config } from "../../shared/config/index.js";
import { UnauthorizedError } from "../../shared/errors/index.js";
import { createChildLogger } from "../../shared/logger/index.js";
import { asyncHandler } from "../../shared/middlewares/index.js";

const logger = createChildLogger("auth.routes");

const adminPassword = config.ADMIN_PASSWORD || "admin";

export function createAuthRouter(): Router {
  const router = express.Router();

  // POST /api/auth/login
  router.post(
    "/auth/login",
    asyncHandler(async (req: Request, res: Response) => {
      const { password } = req.body as { password?: string };

      logger.debug("Auth login attempt");

      if (!password || password !== adminPassword) {
        throw new UnauthorizedError("Invalid password");
      }

      res.json({ ok: true });
    }),
  );

  return router;
}
