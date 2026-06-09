import type { Server } from "node:http";
import { createChildLogger } from "@bete/shared/logger";
import { startHttpServer } from "./http/server.js";
import { closeDatabase } from "./shared/database/index.js";
import { stopCommandBridge } from "./shared/redis/index.js";
import { stopRedisBridge as stopEventBridge } from "./ws/redis-bridge.js";
import { closeWebSocketServer } from "./ws/server.js";

const logger = createChildLogger("backend");

let httpServer: Server | undefined;

async function main() {
  try {
    logger.info("Starting Discord Moderation Backend Service");
    httpServer = await startHttpServer();
    logger.info("Backend service ready");
  } catch (err) {
    logger.error({ err }, "Failed to start backend service");
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down gracefully");

  try {
    // 1. Stop accepting new HTTP connections
    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer!.close(() => {
          logger.info("HTTP server closed");
          resolve();
        });
      });
    }

    // 2. Close WebSocket server
    closeWebSocketServer();

    // 3. Stop Redis bridges (event subscriptions + command channel)
    await Promise.allSettled([
      stopEventBridge().catch((err) =>
        logger.warn({ err }, "Error stopping event bridge"),
      ),
      stopCommandBridge().catch((err) =>
        logger.warn({ err }, "Error stopping command bridge"),
      ),
    ]);

    // 4. Close database pool
    await closeDatabase().catch((err) =>
      logger.warn({ err }, "Error closing database"),
    );

    logger.info("Graceful shutdown completed");
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "Error during graceful shutdown");
    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception");
  shutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled rejection");
  shutdown("unhandledRejection");
});

main();
