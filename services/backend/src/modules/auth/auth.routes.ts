import { timingSafeEqual } from "node:crypto";
import { UnauthorizedError } from "@bete/shared/errors";
import { createChildLogger } from "@bete/shared/logger";
import type { Request, Response, Router } from "express";
import express from "express";
import rateLimit from "express-rate-limit";
import { config } from "../../shared/config/index.js";
import {
  asyncHandler,
  createSessionToken,
  incrementTokenVersion,
  sessionAuth,
} from "../../shared/middlewares/index.js";

const logger = createChildLogger("auth.routes");

const adminPassword = config.ADMIN_PASSWORD;

// Rate limiter: max 10 login attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,    // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,     // Disable `X-RateLimit-*` headers
  message: {
    error: "TOO_MANY_REQUESTS",
    message: "Too many login attempts, please try again later",
  },
});

export function createAuthRouter(): Router {
  const router = express.Router();

  // POST /api/auth/login — rate limited to prevent brute force
  router.post(
    "/auth/login",
    loginLimiter,
    asyncHandler(async (req: Request, res: Response) => {
      const { password } = req.body as { password?: string };

      logger.debug("Auth login attempt");

      if (!password) {
        throw new UnauthorizedError("Invalid password");
      }

      // Constant-time comparison prevents timing attacks
      const pwBuf = Buffer.from(password);
      const adminBuf = Buffer.from(adminPassword);
      const maxLen = Math.max(pwBuf.length, adminBuf.length);
      const diff =
        pwBuf.length !== adminBuf.length ||
        !timingSafeEqual(
          Buffer.concat([pwBuf, Buffer.alloc(maxLen - pwBuf.length)]),
          Buffer.concat([adminBuf, Buffer.alloc(maxLen - adminBuf.length)]),
        );
      if (diff) {
        throw new UnauthorizedError("Invalid password");
      }

      const token = createSessionToken(adminPassword);
      res.json({ ok: true, token });
    }),
  );

  // POST /api/auth/logout — revoke all sessions for admin
  router.post(
    "/auth/logout",
    sessionAuth(adminPassword),
    asyncHandler(async (_req: Request, res: Response) => {
      incrementTokenVersion("admin");
      logger.info("Admin logged out — all sessions revoked");
      res.json({ ok: true });
    }),
  );

  // GET /api/auth/whoami — check if token is valid
  router.get(
    "/auth/whoami",
    sessionAuth(adminPassword),
    asyncHandler(async (_req: Request, res: Response) => {
      res.json({ ok: true, sub: "admin" });
    }),
  );

  return router;
}
