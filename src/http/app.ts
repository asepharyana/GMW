import fs from "node:fs";
import path from "node:path";
import type { Client } from "discord.js-selfbot-v13";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import { AppError } from "../errors.js";
import type { createChildLogger } from "../logger.js";
import type { MediaController } from "../media/mediaController.js";
import type { ModerationBroadcaster } from "../moderation/types.js";
import { createAnalysisRoutes } from "../routes/analysisRoutes.js";
import { createAppConfigRoutes } from "../routes/appConfigRoutes.js";
import { createAnalyticsRoutes } from "../routes/analyticsRoutes.js";
import { createMediaRoutes } from "../routes/mediaRoutes.js";
import { createMessageRoutes } from "../routes/messageRoutes.js";
import { createRecordingsRoutes } from "../routes/recordingsRoutes.js";
import { createReviewRoutes } from "../routes/reviewRoutes.js";
import { createSyncRoutes } from "../routes/syncRoutes.js";
import { createUIStateRoutes } from "../routes/uiStateRoutes.js";
import { createVoiceRoutes } from "../routes/voiceRoutes.js";
import type { SharedUIStatePatch } from "../state/uiState.js";
import type { VoiceController } from "../voiceController.js";
import { createHealthRoutes } from "./health.js";

const publicDir = path.resolve(process.cwd(), "public");
const reactAppDir = path.join(publicDir, "app");

type Logger = ReturnType<typeof createChildLogger>;

export interface CreateHttpAppOptions {
  client: Client;
  voiceController: VoiceController;
  mediaController: MediaController;
  broadcaster: ModerationBroadcaster;
  adminPassword: string;
  getSharedUIState: () => any;
  patchSharedUIState: (patch: SharedUIStatePatch) => any;
  activeUserCount: () => number;
  wsClientCount: () => number;
  logger: Logger;
}

export function createHttpApp(options: CreateHttpAppOptions) {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api/")) {
      res.set("Cache-Control", "no-store");
    }
    res.on("finish", () => {
      if (req.originalUrl.startsWith("/.well-known/appspecific/")) return;
      if (req.originalUrl === "/favicon.ico") return;
      if (res.statusCode >= 400) {
        options.logger.error(
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
  app.use(express.json());

  app.use(express.static(publicDir));
  app.use(express.static(reactAppDir));

  app.get("/", (_req: Request, res: Response) => {
    const reactIndex = path.join(reactAppDir, "index.html");
    if (fs.existsSync(reactIndex)) {
      res.sendFile(reactIndex);
      return;
    }
    res
      .status(503)
      .send("React dashboard is not built. Run pnpm run build:web.");
  });

  // Health and auth routes
  app.use(
    createHealthRoutes({
      adminPassword: options.adminPassword,
      activeUserCount: options.activeUserCount,
      wsClientCount: options.wsClientCount,
    }),
  );

  // Route modules
  app.use(
    "/api",
    createUIStateRoutes({
      getSharedUIState: options.getSharedUIState,
      patchSharedUIState: options.patchSharedUIState,
    }),
  );
  app.use(
    "/api",
    createVoiceRoutes({
      voiceController: options.voiceController,
      patchSharedUIState: options.patchSharedUIState,
      broadcaster: options.broadcaster,
      adminPassword: options.adminPassword,
    }),
  );
  app.use("/api", createMessageRoutes());
  app.use("/api", createAnalysisRoutes());
  app.use("/api", createAppConfigRoutes());
  app.use("/api", createReviewRoutes());
  app.use("/api", createAnalyticsRoutes());
  app.use("/api", createSyncRoutes(options.client));
  app.use("/api", createRecordingsRoutes());
  app.use(
    "/api",
    createMediaRoutes(options.mediaController, {
      adminPassword: options.adminPassword,
    }),
  );

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        error: error.code,
        message: error.message,
      });
      return;
    }

    options.logger.error({ error }, "Unhandled webserver error");
    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
    });
  });

  return app;
}
