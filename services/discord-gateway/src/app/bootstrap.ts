import { ConfigError, DatabaseError } from "@bete/shared/errors";
import { createChildLogger } from "@bete/shared/logger";
import { Client } from "discord.js-selfbot-v13";
import { inArray, lt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { startPendingAIAnalysisWorker } from "../modules/ai-moderation/aiAnalyzer.js";
import { registerChannelTopicCapture } from "../modules/channel-topic/index.js";
import { CommandHandler } from "../modules/command-handler/commandHandler.js";
import {
  EventBroadcaster,
  RedisEventPublisher,
} from "../modules/event-broadcaster/index.js";
import {
  startMetricsServer,
  stopMetricsServer,
} from "../modules/gateway-metrics/index.js";
import { registerGuildMemberEvents } from "../modules/guild-member-events/index.js";
import {
  registerMessageCapture,
  setEventBroadcaster as setMessageCaptureEventBroadcaster,
} from "../modules/message-capture/messageCapture.js";
import { getExpiredMessages } from "../modules/message-capture/messageStore.js";
import { registerReactionCapture } from "../modules/reaction-tracking/index.js";
import { registerThreadCapture } from "../modules/thread-tracking/index.js";
import { registerPresenceCapture } from "../modules/user-presence/index.js";
import {
  startMuxerWorker,
  stopMuxerWorker,
} from "../modules/voice-recording/muxer.js";
import { setEventBroadcaster as setRecorderEventBroadcaster } from "../modules/voice-recording/recorder.js";
import { VoiceController } from "../modules/voice-recording/voiceController.js";
import { config } from "../shared/config/config.js";
import {
  closeDatabase,
  getDatabase,
  initializeDatabase,
} from "../shared/database/drizzle.js";
import { runMigrations } from "../shared/database/migrate.js";
import type * as schema from "../shared/database/schema.js";
import {
  attachmentsTable,
  messagesTable,
  voiceRecordingsTable,
} from "../shared/database/schema.js";
import { createDiscordClientOptions } from "../shared/discord/clientOptions.js";
import { createGracefulShutdown } from "./shutdown.js";

const logger = createChildLogger("discord-gateway");

// ─── Retention Cleanup ─────────────────────────────────────────────────────

function startRetentionCleanup(): void {
  const intervalMs = config.RETENTION_CLEANUP_INTERVAL_MS;
  const dryRun = config.RETENTION_DRY_RUN;

  logger.info(
    {
      intervalMs,
      dryRun,
      messagesDays: config.RETENTION_MESSAGES_DAYS,
      attachmentsDays: config.RETENTION_ATTACHMENTS_DAYS,
      voiceDays: config.RETENTION_VOICE_DAYS,
    },
    "Starting retention cleanup scheduler",
  );

  async function runCleanupTick(): Promise<void> {
    const db = getDatabase() as unknown as NodePgDatabase<typeof schema>;

    // ── Expired messages ────────────────────────────────────────────────
    if (config.RETENTION_MESSAGES_DAYS > 0) {
      try {
        const expiredMessages = await getExpiredMessages(
          config.RETENTION_MESSAGES_DAYS,
        );

        if (expiredMessages.length > 0) {
          const ids = expiredMessages.map((m: { id: string }) => m.id);
          logger.info(
            { count: ids.length, dryRun },
            "Expired messages found for cleanup",
          );

          if (!dryRun) {
            await db
              .delete(messagesTable)
              .where(inArray(messagesTable.id, ids));
            logger.info({ count: ids.length }, "Expired messages deleted");
          }
        }
      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
          },
          "Failed to clean up expired messages",
        );
      }
    }

    // ── Expired attachments ─────────────────────────────────────────────
    if (config.RETENTION_ATTACHMENTS_DAYS > 0) {
      try {
        const cutoff =
          Date.now() - config.RETENTION_ATTACHMENTS_DAYS * 24 * 60 * 60 * 1000;

        const expiredAttachments = await db
          .select({ id: attachmentsTable.id })
          .from(attachmentsTable)
          .where(lt(attachmentsTable.created_at, cutoff))
          .limit(1000);

        if (expiredAttachments.length > 0) {
          const ids = expiredAttachments.map((a: { id: string }) => a.id);
          logger.info(
            { count: ids.length, dryRun },
            "Expired attachments found for cleanup",
          );

          if (!dryRun) {
            await db
              .delete(attachmentsTable)
              .where(inArray(attachmentsTable.id, ids));
            logger.info({ count: ids.length }, "Expired attachments deleted");
          }
        }
      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
          },
          "Failed to clean up expired attachments",
        );
      }
    }

    // ── Expired voice recordings ────────────────────────────────────────
    if (config.RETENTION_VOICE_DAYS > 0) {
      try {
        const cutoff =
          Date.now() - config.RETENTION_VOICE_DAYS * 24 * 60 * 60 * 1000;

        const expiredRecordings = await db
          .select({ id: voiceRecordingsTable.id })
          .from(voiceRecordingsTable)
          .where(lt(voiceRecordingsTable.created_at, cutoff))
          .limit(1000);

        if (expiredRecordings.length > 0) {
          const ids = expiredRecordings.map((r: { id: string }) => r.id);
          logger.info(
            { count: ids.length, dryRun },
            "Expired voice recordings found for cleanup",
          );

          if (!dryRun) {
            await db
              .delete(voiceRecordingsTable)
              .where(inArray(voiceRecordingsTable.id, ids));
            logger.info(
              { count: ids.length },
              "Expired voice recordings deleted",
            );
          }
        }
      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
          },
          "Failed to clean up expired voice recordings",
        );
      }
    }
  }

  // Run immediately on start, then schedule
  runCleanupTick().catch((error) => {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Initial retention cleanup tick failed",
    );
  });

  setInterval(() => {
    runCleanupTick().catch((error) => {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Retention cleanup tick failed",
      );
    });
  }, intervalMs);
}

// ─── Bootstrap ─────────────────────────────────────────────────────────────

export async function initializeDiscordGateway() {
  if (config.AI_ANALYSIS_ENABLED && !config.AI_LLM_API_KEY) {
    throw new ConfigError(
      "AI_ANALYSIS_ENABLED=true but AI_LLM_API_KEY is missing from environment. AI analysis cannot run without credentials.",
    );
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
  const eventBroadcaster = new EventBroadcaster(redisPublisher);

  // Initialize Redis command handler for backend→gateway commands
  const commandHandler = new CommandHandler();

  const gracefulShutdown = createGracefulShutdown({
    logger,
    closeDatabase,
    voiceController,
    client,
    eventBroadcaster,
    commandHandler,
    stopMetricsServer,
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
    throw new DatabaseError(
      `Database initialization failed: ${err instanceof Error ? err.message : String(err)}`,
    );
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
    setMessageCaptureEventBroadcaster(eventBroadcaster);
    setRecorderEventBroadcaster(eventBroadcaster);
    registerMessageCapture(client);
    startPendingAIAnalysisWorker(client, eventBroadcaster);

    // Register new event captures
    registerReactionCapture(client, eventBroadcaster);
    registerThreadCapture(client, eventBroadcaster);
    registerPresenceCapture(client, eventBroadcaster);
    registerChannelTopicCapture(client, eventBroadcaster);
    registerGuildMemberEvents(client, eventBroadcaster);

    // Start background workers
    startMuxerWorker();

    // Start command handler after Discord is ready
    commandHandler.start(client, voiceController);
    logger.info("Command handler started");

    // Start retention cleanup scheduler
    startRetentionCleanup();
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

  // Start metrics server
  startMetricsServer();

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
