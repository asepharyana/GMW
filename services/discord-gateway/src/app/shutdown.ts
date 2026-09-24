import type { Client } from "discord.js-selfbot-v13";
import type { createChildLogger } from "@/shared/logger/index";
import {
  mediaWorkerPool,
  textWorkerPool,
} from "../modules/ai-moderation/circuitBreaker.js";
import type { CommandHandler } from "../modules/command-handler/commandHandler.js";
import type { EventBroadcaster } from "../modules/event-broadcaster/index.js";
import type { stopMetricsServer } from "../modules/gateway-metrics/index.js";
import type { closeDatabase } from "../shared/database/drizzle.js";

type Logger = ReturnType<typeof createChildLogger>;
type CloseDatabase = typeof closeDatabase;
type StopMetricsServer = typeof stopMetricsServer;

export interface GracefulShutdownOptions {
  logger: Logger;
  closeDatabase: CloseDatabase;
  client: Client;
  eventBroadcaster: EventBroadcaster;
  commandHandler: CommandHandler;
  stopMetricsServer?: StopMetricsServer;
}

export type GracefulShutdown = (signal: string) => Promise<void>;

/** Create a shutdown handler that can only be triggered once. */
export function createGracefulShutdown(
  options: GracefulShutdownOptions,
): GracefulShutdown {
  let isShuttingDown = false;

  return async function gracefulShutdown(signal: string): Promise<void> {
    if (isShuttingDown) {
      options.logger.warn(`Already shutting down, ignoring ${signal}`);
      return;
    }

    isShuttingDown = true;
    options.logger.info({ signal }, "Graceful shutdown initiated");

    try {
      options.stopMetricsServer?.();

      // 1. Close Redis/pubsub
      options.logger.info("Closing event broadcaster...");
      await options.eventBroadcaster.close();

      options.logger.info("Closing command handler...");
      await options.commandHandler.close();

      // ½. Tear down AI-analysis worker pools BEFORE closing the DB.
      // Piscina worker threads survive process.exit() as orphans otherwise —
      // they keep holding DB connections/locks after the main process is gone.
      // (Two live gateways fighting over the same rows was the root cause of
      // messages stuck in ai_status='processing'.)
      options.logger.info("Destroying AI worker pools...");
      const destroyPool = (pool: { destroy: () => Promise<void> }) =>
        Promise.race([
          pool.destroy(),
          new Promise<void>((resolve) =>
            setTimeout(() => {
              options.logger.warn(
                "Timed out destroying worker pool; exiting anyway",
              );
              resolve();
            }, 5000),
          ),
        ]);
      await Promise.allSettled([
        destroyPool(textWorkerPool),
        destroyPool(mediaWorkerPool),
      ]);
      options.logger.info("AI worker pools destroyed");

      // 2. DB pool
      options.logger.info("Closing database...");
      await options.closeDatabase();
      options.logger.info("Database closed");

      options.logger.info("Destroying Discord client...");
      try {
        options.client.destroy();
      } catch (err) {
        options.logger.warn({ error: err }, "Error destroying client");
      }

      options.logger.info("Graceful shutdown completed");
      process.exit(0);
    } catch (err) {
      options.logger.error({ error: err }, "Error during graceful shutdown");
      process.exit(1);
    }
  };
}
