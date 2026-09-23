import { Client } from "discord.js-selfbot-v13";
import { ConfigError, DatabaseError } from "@/shared/errors/index";
import { createChildLogger } from "@/shared/logger/index";
import {
  getAnalysisQueueStatus,
  startPendingAIAnalysisWorker,
} from "../modules/ai-moderation/aiAnalyzer.js";
import {
  mediaWorkerPool,
  textWorkerPool,
} from "../modules/ai-moderation/circuitBreaker.js";
import { registerChannelTopicCapture } from "../modules/channel-topic/index.js";
import { CommandHandler } from "../modules/command-handler/commandHandler.js";
import {
  EventBroadcaster,
  RedisEventPublisher,
} from "../modules/event-broadcaster/index.js";
import {
  registerCollector,
  setGauge,
  startMetricsServer,
  stopMetricsServer,
} from "../modules/gateway-metrics/index.js";
import { registerGuildMemberEvents } from "../modules/guild-member-events/index.js";
import {
  registerMessageCapture,
  setEventBroadcaster as setMessageCaptureEventBroadcaster,
} from "../modules/message-capture/messageCapture.js";
import { setModerationEventBroadcaster } from "../modules/message-capture/moderationActionsDb.js";
import { startDigestScheduler } from "../modules/monitor/digestScheduler.js";
import { registerReactionCapture } from "../modules/reaction-tracking/index.js";
import { registerThreadCapture } from "../modules/thread-tracking/index.js";
import { registerPresenceCapture } from "../modules/user-presence/index.js";
import { config } from "../shared/config/config.js";
import {
  closeDatabase,
  initializeDatabase,
} from "../shared/database/drizzle.js";
import { runMigrations } from "../shared/database/migrate.js";
import { createDiscordClientOptions } from "../shared/discord/clientOptions.js";
import { startRetentionCleanup } from "./retention.js";
import { createGracefulShutdown } from "./shutdown.js";

const logger = createChildLogger("discord-gateway");

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

  // Initialize Redis event broadcaster
  const redisPublisher = new RedisEventPublisher(config.REDIS_URL, logger);
  const eventBroadcaster = new EventBroadcaster(redisPublisher);

  // Initialize Redis command handler for backend→gateway commands
  const commandHandler = new CommandHandler();

  const gracefulShutdown = createGracefulShutdown({
    logger,
    closeDatabase,
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
    logger.error(
      { err, errorMsg: err instanceof Error ? err.message : String(err) },
      "Failed to initialize database",
    );
    throw new DatabaseError(
      `Database initialization failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  client.on("debug", (msg) => {
    if (
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
    setModerationEventBroadcaster(eventBroadcaster);
    registerMessageCapture(client);
    startPendingAIAnalysisWorker(client, eventBroadcaster);

    // Register new event captures
    registerReactionCapture(client, eventBroadcaster);
    registerThreadCapture(client, eventBroadcaster);
    registerPresenceCapture(client, eventBroadcaster);
    registerChannelTopicCapture(client, eventBroadcaster);
    registerGuildMemberEvents(client, eventBroadcaster);

    // Start command handler after Discord is ready
    commandHandler.start(client);
    logger.info("Command handler started");

    // Start retention cleanup scheduler
    startRetentionCleanup();
    // Start weekly moderation digest (public, automated)
    startDigestScheduler();
  });

  client.on("error", (err) => {
    logger.error(
      { err, errorMsg: err instanceof Error ? err.message : String(err) },
      "Client error",
    );
  });

  process.on("SIGINT", () => {
    gracefulShutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    gracefulShutdown("SIGTERM");
  });

  process.on("uncaughtException", (err) => {
    const code =
      typeof (err as NodeJS.ErrnoException).code === "string"
        ? (err as NodeJS.ErrnoException).code
        : "";
    // Transient stream-teardown errors (voice stop/disconnect races, child
    // process stdin closed while we still write) are NOT fatal — crashing the
    // gateway on EPIPE takes the whole bot offline mid-music. Log + continue.
    if (
      code === "EPIPE" ||
      code === "ERR_STREAM_DESTROYED" ||
      code === "ERR_STREAM_WRITE_AFTER_END" ||
      code === "ECONNRESET"
    ) {
      logger.warn(
        { error: err },
        "Uncaught transient stream error — continuing",
      );
      return;
    }
    logger.error(
      {
        err,
        errorMsg: err instanceof Error ? err.message : String(err),
        stack: err?.stack,
      },
      "Uncaught exception",
    );
    gracefulShutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason) => {
    const err =
      reason instanceof Error ? reason : new Error(String(reason ?? "unknown"));
    const code = (err as NodeJS.ErrnoException).code ?? "";
    // Same transient-teardown policy as uncaughtException: a rejection that
    // fires while a stream is being torn down (EPIPE after ffmpeg stdin
    // closes, write-after-destroy, socket reset) must NOT take the whole
    // gateway offline. Log detail + continue. Everything else still shuts
    // down so real bugs surface.
    if (
      code === "EPIPE" ||
      code === "ERR_STREAM_DESTROYED" ||
      code === "ERR_STREAM_WRITE_AFTER_END" ||
      code === "ECONNRESET"
    ) {
      logger.warn(
        { error: err },
        "Unhandled rejection transient stream error — continuing",
      );
      return;
    }
    logger.error({ error: err, reason: String(reason) }, "Unhandled rejection");
    gracefulShutdown("unhandledRejection");
  });

  // ── Metrics: register live pipeline collectors before starting server ──
  // These refresh on every scrape so Prometheus sees real AI-analysis
  // queue depth, concurrency, and DB pool state instead of an empty stub.
  registerCollector(() => {
    if (!config.AI_ANALYSIS_ENABLED) return;
    try {
      const status = getAnalysisQueueStatus();
      setGauge("ai_analysis_queued_conversations", status.queuedConversations);
      setGauge("ai_analysis_active_batch_requests", status.activeRequests);
      setGauge(
        "ai_analysis_active_individual_requests",
        status.activeIndividualRequests,
      );
      setGauge(
        "ai_analysis_individual_in_flight",
        status.individualInFlightCount,
      );
      setGauge(
        "ai_analysis_individual_circuit_breaker_active",
        status.individualCircuitBreakerActive ? 1 : 0,
      );
      if (typeof status.lastError === "string") {
        setGauge("ai_analysis_last_error_present", status.lastError ? 1 : 0);
      }
      type PoolState = { _poolState?: { size: number; active: number } };
      const textPool = textWorkerPool as unknown as PoolState;
      const mediaPool = mediaWorkerPool as unknown as PoolState;
      // Reported per queue (2026-08-31 text/media pool split) so the text
      // and media backlogs are distinguishable in dashboards/alerts instead
      // of one combined "worker threads" number.
      if (textPool._poolState) {
        setGauge("ai_analysis_worker_threads_text", textPool._poolState.size);
        setGauge(
          "ai_analysis_worker_threads_active_text",
          textPool._poolState.active,
        );
      }
      if (mediaPool._poolState) {
        setGauge("ai_analysis_worker_threads_media", mediaPool._poolState.size);
        setGauge(
          "ai_analysis_worker_threads_active_media",
          mediaPool._poolState.active,
        );
      }
    } catch (err) {
      logger.warn({ error: String(err) }, "AI metrics collector failed");
    }
  });

  // Start metrics server
  startMetricsServer();

  logger.info("Calling Discord client.login");

  // Fix: use await + try/catch instead of .then().catch()
  try {
    await client.login(token);
    logger.info("Discord client logged in successfully");
  } catch (err) {
    logger.fatal({ err }, "Failed to login Discord client");
    throw err;
  }
}
