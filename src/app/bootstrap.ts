import { Client } from "discord.js-selfbot-v13";
import { config } from "../config.js";
import { closeDatabase, initializeDatabase } from "../database/drizzle.js";
import { createDiscordClientOptions } from "../discordClientOptions.js";
import { createChildLogger } from "../logger.js";
import { startPendingAIAnalysisWorker } from "../moderation/aiAnalyzer.js";
import { syncBacklogMessages } from "../moderation/backlogSync.js";
import { registerMessageCapture } from "../moderation/messageCapture.js";
import { discordPlayer } from "../player.js";
import { VoiceController } from "../voiceController.js";
import { startWebserver } from "../webserver.js";
import { createGracefulShutdown } from "./shutdown.js";

export async function initializeApp() {
  const logger = createChildLogger("bot");

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

  const gracefulShutdown = createGracefulShutdown({
    logger,
    closeDatabase,
    voiceController,
    discordPlayer,
    client,
  });

  try {
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
    registerMessageCapture(client);
    startPendingAIAnalysisWorker(client);
    syncBacklogMessages(client).catch((error) => {
      logger.warn({ error }, "Backlog sync failed");
    });
    await startWebserver(config.WEBSERVER_PORT, client, voiceController);
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
    .catch((error) => {
      logger.error({ error }, "Discord client.login failed");
    });
}
