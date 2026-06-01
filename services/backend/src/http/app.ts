import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import { createAnalyticsRouter } from "../modules/analytics/routes/index.js";
import { createHealthRouter } from "../modules/health/routes/index.js";
import { createMediaRouter } from "../modules/media/routes/index.js";
import { createMessagesRouter } from "../modules/messages/routes/index.js";
import { createVoiceRouter } from "../modules/voice/routes/index.js";
import { createChildLogger } from "../shared/logger/index.js";
import { errorHandler } from "../shared/middlewares/index.js";

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

  // API routes
  app.use("/api", createMessagesRouter());
  app.use("/api", createAnalyticsRouter());
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
