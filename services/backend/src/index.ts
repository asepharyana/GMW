import { startHttpServer } from "./http/server.js";
import { createChildLogger } from "./shared/logger/index.js";

const logger = createChildLogger("backend");

async function main() {
  try {
    logger.info("Starting Discord Moderation Backend Service");
    await startHttpServer();
    logger.info("Backend service ready");
  } catch (err) {
    logger.error({ err }, "Failed to start backend service");
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", () => {
  logger.info("Received SIGINT, shutting down gracefully");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM, shutting down gracefully");
  process.exit(0);
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled rejection");
  process.exit(1);
});

main();
