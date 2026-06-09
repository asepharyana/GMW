import type { Server } from "node:http";
import { createChildLogger } from "@bete/shared/logger";
import { startHttpServer } from "./http/server.js";

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

function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down gracefully");

  if (httpServer) {
    httpServer.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });

    // Force exit after 10s if connections don't close
    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10_000).unref();
  } else {
    process.exit(0);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled rejection");
  process.exit(1);
});

main();
