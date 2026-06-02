import { Client } from "discord.js-selfbot-v13";
import { startPendingAIAnalysisWorker } from "../modules/ai-moderation/aiAnalyzer.js";
import { CommandHandler } from "../modules/command-handler/commandHandler.js";
import {
  EventBroadcaster,
  RedisEventPublisher,
} from "../modules/event-broadcaster/index.js";
import {
  registerMessageCapture,
  setEventBroadcaster,
} from "../modules/message-capture/messageCapture.js";
import { VoiceController } from "../modules/voice-recording/voiceController.js";
import { config } from "../shared/config/config.js";
import {
  closeDatabase,
  initializeDatabase,
} from "../shared/database/drizzle.js";
import { runMigrations } from "../shared/database/migrate.js";
import { createDiscordClientOptions } from "../shared/discord/clientOptions.js";
import { createChildLogger } from "../shared/logger/logger.js";
import { createGracefulShutdown } from "./shutdown.js";

const logger = createChildLogger("discord-gateway");

export async function initializeDiscordGateway() {
  if (!config.AI_LLM_API_KEY) {
    logger.error(
      "AI_LLM_API_KEY is missing from environment. Force closing application as AI environment is required.",
    );
    process.exit(1);
  }

  const token = config.DISCORD_TOKEN;
  logger.info(
    { hasToken: token.length > 0, tokenLength: token.length },
    "Config loaded",
  );

  logger.info("Creating Discord client");
  const client = new Client(createDiscordClientOptions());
  const voiceController = new VoiceController(client);

  // Initialize Redis event broadcaster
  const redisPublisher = new RedisEventPublisher(config.REDIS_URL, logger);
  const eventBroadcaster = new EventBroadcaster(redisPublisher, logger);

  // Initialize Redis command handler for backend→gateway commands
  const commandHandler = new CommandHandler();

  const gracefulShutdown = createGracefulShutdown({
    logger,
    closeDatabase,
    voiceController,
    client,
    eventBroadcaster,
    commandHandler,
  });

  try {
    if (config.AUTO_MIGRATE_ON_STARTUP) {
      logger.info(
        "AUTO_MIGRATE_ON_STARTUP enabled; running database migrations",
      );
      await runMigrations();
    }

    logger.info("Initializing database");
    await initializeDatabase();
    logger.info("PostgreSQL database initialized");
  } catch (err) {
    logger.error({ error: err }, "Failed to initialize database");
    process.exit(1);
  }

  client.on("debug", (msg) => {
    if (
      msg.includes("[VOICE") ||
      msg.includes("[ffmpeg") ||
      msg.toLowerCase().includes("error") ||
      msg.toLowerCase().includes("stream")
    ) {
      logger.info({ debugMsg: msg }, "Discord Client Debug");
    } else if (config.VERBOSE) {
      logger.debug({ debugMsg: msg }, "Discord Client Debug");
    }
  });

  client.on("ready", async () => {
    logger.info({ user: client.user?.tag }, "Bot logged in");
    setEventBroadcaster(eventBroadcaster);
    registerMessageCapture(client);
    startPendingAIAnalysisWorker(client, eventBroadcaster);

    // Start command handler after Discord is ready
    commandHandler.start(client, voiceController);
    logger.info("Command handler started");
  });

  client.on("error", (err) => {
    logger.error({ error: err }, "Client error");
  });

  process.on("SIGINT", () => {
    gracefulShutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    gracefulShutdown("SIGTERM");
  });

  process.on("uncaughtException", (err) => {
    logger.error({ error: err }, "Uncaught exception");
    gracefulShutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason, promise) => {
    logger.error({ reason, promise }, "Unhandled rejection");
    gracefulShutdown("unhandledRejection");
  });

  logger.info("Calling Discord client.login");
  client
    .login(token)
    .then(() => {
      logger.info("Discord client.login resolved");
    })
    .catch((error: unknown) => {
      logger.error({ error }, "Discord client.login failed");
    });
}
