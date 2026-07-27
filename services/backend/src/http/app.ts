import { createChildLogger } from "@bete/shared/logger";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import { createAnalysisRouter } from "../modules/analysis/index.js";
import { createConfigRouter } from "../modules/config/index.js";
import { createDashboardRouter } from "../modules/dashboard/index.js";
import { createHealthRouter } from "../modules/health/index.js";
import { createMascotChatRouter } from "../modules/mascot-chat/index.js";
import { createMediaRouter } from "../modules/media/index.js";
import { createMessagesRouter } from "../modules/messages/index.js";
import { createRecordingsRouter } from "../modules/recordings/index.js";
import { createUiStateRouter } from "../modules/ui-state/index.js";
import { createVoiceRouter } from "../modules/voice/index.js";
import { errorHandler } from "../shared/middlewares/index.js";

// Auth removed — dashboard is public

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

  // All routes are public
  app.use("/api", createHealthRouter());
  app.use("/api", createConfigRouter());
  app.use("/api", createDashboardRouter());
  app.use("/api", createMessagesRouter());
  app.use("/api", createAnalysisRouter());
  app.use("/api", createMascotChatRouter());
  app.use("/api", createRecordingsRouter());
  app.use("/api", createUiStateRouter());
  app.use("/api", createMediaRouter());
  app.use("/api", createVoiceRouter());

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
