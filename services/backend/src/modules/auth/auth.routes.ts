import { UnauthorizedError } from "@bete/shared/errors";
import { createChildLogger } from "@bete/shared/logger";
import type { Request, Response, Router } from "express";
import express from "express";
import { config } from "../../shared/config/index.js";
import { asyncHandler, rateLimit } from "../../shared/middlewares/index.js";

const logger = createChildLogger("auth.routes");

const adminPassword = config.ADMIN_PASSWORD || "admin";

// Rate limit: max 10 login attempts per IP per 15 minutes
const loginRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

export function createAuthRouter(): Router {
  const router = express.Router();

  // POST /api/auth/login
  router.post(
    "/auth/login",
    loginRateLimit,
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
