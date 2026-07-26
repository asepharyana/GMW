import type { createChildLogger } from "@bete/shared/logger";
import type { Client } from "discord.js-selfbot-v13";
import type { CommandHandler } from "../modules/command-handler/commandHandler.js";
import type { EventBroadcaster } from "../modules/event-broadcaster/index.js";
import type { stopMetricsServer } from "../modules/gateway-metrics/index.js";
import type { VoicePcmWsClient } from "../modules/voice-pcm-ws/index.js";
import { stopMuxerWorker } from "../modules/voice-recording/muxer.js";
import type { VoiceController } from "../modules/voice-recording/voiceController.js";
import type { closeDatabase } from "../shared/database/drizzle.js";

type Logger = ReturnType<typeof createChildLogger>;
type CloseDatabase = typeof closeDatabase;
type StopMetricsServer = typeof stopMetricsServer;

export interface GracefulShutdownOptions {
  logger: Logger;
  closeDatabase: CloseDatabase;
  voiceController: VoiceController;
  client: Client;
  eventBroadcaster: EventBroadcaster;
  commandHandler: CommandHandler;
  stopMetricsServer?: StopMetricsServer;
  pcmWsClient?: VoicePcmWsClient;
}

export function createGracefulShutdown(options: GracefulShutdownOptions) {
  let isShuttingDown = false;

  return async function gracefulShutdown(signal: string) {
    if (isShuttingDown) {
      options.logger.warn(`Already shutting down, ignoring ${signal}`);
      return;
    }

    isShuttingDown = true;
    options.logger.info({ signal }, "Graceful shutdown initiated");

    try {
      options.stopMetricsServer?.();
      stopMuxerWorker();

      // 1. Voice disconnect (may write final DB records)
      options.logger.info("Stopping voice connection...");
      await options.voiceController.disconnect();

      // 1b. Close PCM WebSocket client (after voice, before Redis)
      if (options.pcmWsClient) {
        options.logger.info("Closing voice PCM WS client...");
        await options.pcmWsClient.close();
      }

      // 2. Close Redis/pubsub after voice is done
      options.logger.info("Closing event broadcaster...");
      await options.eventBroadcaster.close();

      options.logger.info("Closing command handler...");
      await options.commandHandler.close();

      // 3. DB pool LAST – voice disconnect may finalize recordings
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
