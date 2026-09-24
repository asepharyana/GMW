import { Client } from "discord.js-selfbot-v13";
import {
  ConfigError,
  DatabaseError,
  errorMessage,
} from "@/shared/errors/index.js";
import { createChildLogger } from "@/shared/logger/index.js";
import { CommandHandler } from "../modules/command-handler/commandHandler.js";
import {
  EventBroadcaster,
  RedisEventPublisher,
} from "../modules/event-broadcaster/index.js";
import {
  startMetricsServer,
  stopMetricsServer,
} from "../modules/gateway-metrics/index.js";
import { config } from "../shared/config/index.js";
import {
  closeDatabase,
  initializeDatabase,
} from "../shared/database/drizzle.js";
import { runMigrations } from "../shared/database/migrate.js";
import { createDiscordClientOptions } from "../shared/discord/clientOptions.js";
import { startGatewayLifecycle } from "./lifecycle.js";
import { registerPipelineMetrics } from "./metrics-collector.js";
import { registerProcessGuards } from "./process-guards.js";
import { createGracefulShutdown } from "./shutdown.js";

const logger = createChildLogger("discord-gateway");

// ─── Bootstrap ─────────────────────────────────────────────────────────────
//
// Startup order:
//   1. validate config            (fail fast on missing AI credentials)
//   2. connect infrastructure     (migrations → DB pool)
//   3. build long-lived services  (Discord client, Redis publisher, command
//                                  handler) + install shutdown/process guards
//   4. start observability        (pipeline gauges → metrics server)
//   5. log in                     (ready-hook wires listeners via lifecycle.ts)

/** Refuse to start when AI analysis is on but no LLM credentials exist. */
function assertConfigIsUsable(): void {
  if (config.AI_ANALYSIS_ENABLED && !config.AI_LLM_API_KEY) {
    throw new ConfigError(
      "AI_ANALYSIS_ENABLED=true but AI_LLM_API_KEY is missing from environment. AI analysis cannot run without credentials.",
    );
  }
}

/** Run migrations (when enabled) then open the PostgreSQL pool. */
async function connectDatabase(): Promise<void> {
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
    logger.error(
      { err, errorMsg: errorMessage(err) },
      "Failed to initialize database",
    );
    throw new DatabaseError(
      `Database initialization failed: ${errorMessage(err)}`,
    );
  }
}

/** Log only client debug lines that carry signal (errors/streams, or VERBOSE). */
function registerClientDebugLogging(client: Client): void {
  client.on("debug", (msg) => {
    const lower = msg.toLowerCase();
    if (lower.includes("error") || lower.includes("stream")) {
      logger.info({ debugMsg: msg }, "Discord Client Debug");
    } else if (config.VERBOSE) {
      logger.debug({ debugMsg: msg }, "Discord Client Debug");
    }
  });
}

export async function initializeDiscordGateway() {
  assertConfigIsUsable();

  const token = config.DISCORD_TOKEN;
  logger.info(
    { hasToken: token.length > 0, tokenLength: token.length },
    "Config loaded",
  );

  logger.info("Creating Discord client");
  const client = new Client(createDiscordClientOptions());

  // Long-lived services: Redis event broadcaster (gateway → backend) and the
  // Redis command handler (backend → gateway).
  const redisPublisher = new RedisEventPublisher(config.REDIS_URL, logger);
  const eventBroadcaster = new EventBroadcaster(redisPublisher);
  const commandHandler = new CommandHandler();

  const gracefulShutdown = createGracefulShutdown({
    logger,
    closeDatabase,
    client,
    eventBroadcaster,
    commandHandler,
    stopMetricsServer,
  });

  await connectDatabase();

  registerClientDebugLogging(client);

  client.on("ready", () => {
    logger.info({ user: client.user?.tag }, "Bot logged in");
    startGatewayLifecycle({
      client,
      eventBroadcaster,
      commandHandler,
      logger,
    });
  });

  client.on("error", (err) => {
    logger.error({ err, errorMsg: errorMessage(err) }, "Client error");
  });

  registerProcessGuards(logger, gracefulShutdown);

  // Metrics: register live pipeline collectors before starting the server.
  registerPipelineMetrics(logger);
  startMetricsServer();

  logger.info("Calling Discord client.login");
  try {
    await client.login(token);
    logger.info("Discord client logged in successfully");
  } catch (err) {
    logger.fatal({ err }, "Failed to login Discord client");
    throw err;
  }
}
