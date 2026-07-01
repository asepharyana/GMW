import { createChildLogger } from "@bete/shared/logger";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import { createAnalysisRouter } from "../modules/analysis/analysis.routes.js";
import { createAuthRouter } from "../modules/auth/auth.routes.js";
import { createConfigRouter } from "../modules/config/config.routes.js";
import { createDashboardRouter } from "../modules/dashboard/dashboard.routes.js";
import { createHealthRouter } from "../modules/health/health.routes.js";
import { createMascotChatRouter } from "../modules/mascot-chat/mascot-chat.routes.js";
import { createMediaRouter } from "../modules/media/media.routes.js";
import { createMessagesRouter } from "../modules/messages/messages.routes.js";
import { createRecordingsRouter } from "../modules/recordings/recordings.routes.js";
import { createUiStateRouter } from "../modules/ui-state/ui-state.routes.js";
import { createGuildsRouter } from "../modules/voice/guilds.routes.js";
import { createVoiceRouter } from "../modules/voice/voice.routes.js";
import {
  adminAuth,
  errorHandler,
} from "../shared/middlewares/index.js";
import { config } from "../shared/config/index.js";

const ADMIN_PASSWORD = config.ADMIN_PASSWORD || "admin";

const logger = createChildLogger("http.app");

export function createHttpApp(): Express {
  const app = express();

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logging
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api/")) {
      res.set("Cache-Control", "no-store");
    }
    res.on("finish", () => {
      if (req.originalUrl.startsWith("/.well-known/")) return;
      if (req.originalUrl === "/favicon.ico") return;
      if (res.statusCode >= 400) {
        logger.warn(
          {
            method: req.method,
            url: req.originalUrl,
            statusCode: res.statusCode,
          },
          "HTTP request failed",
        );
      }
    });
    next();
  });

  // Health check (no auth required)
  app.use("/api", createHealthRouter());

  // Auth (no auth required)
  app.use("/api", createAuthRouter());

  // Public read-only endpoints
  app.use("/api", createConfigRouter());
  app.use("/api", createDashboardRouter());
  app.use("/api", createMessagesRouter());
  app.use("/api", createAnalysisRouter());
  app.use("/api", createMascotChatRouter());
  app.use("/api", createRecordingsRouter());
  app.use("/api", createUiStateRouter());
  app.use("/api/guilds", createGuildsRouter());

  // Protected routes — require admin authentication (X-Admin-Password header)
  // Only voice and media control endpoints need auth
  const adminAuthMiddleware = adminAuth(ADMIN_PASSWORD);
  app.use("/api", adminAuthMiddleware, createMediaRouter());
  app.use("/api", adminAuthMiddleware, createVoiceRouter());

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: "NOT_FOUND",
      message: "Endpoint not found",
    });
  });

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
