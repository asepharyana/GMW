import { Client } from "discord.js-selfbot-v13";
import { inArray, lt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ConfigError, DatabaseError } from "@/shared/errors/index";
import { createChildLogger } from "@/shared/logger/index";
import {
  getAnalysisQueueStatus,
  startPendingAIAnalysisWorker,
} from "../modules/ai-moderation/aiAnalyzer.js";
import { workerPool } from "../modules/ai-moderation/circuitBreaker.js";
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
import { registerReactionCapture } from "../modules/reaction-tracking/index.js";
import { registerThreadCapture } from "../modules/thread-tracking/index.js";
import { registerPresenceCapture } from "../modules/user-presence/index.js";
import { VoicePcmWsClient } from "../modules/voice-pcm-ws/index.js";
import { startMuxerWorker } from "../modules/voice-recording/muxer.js";
import {
  setPcmWsClient,
  setEventBroadcaster as setRecorderEventBroadcaster,
} from "../modules/voice-recording/recorder.js";
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

async function deleteExpiredRecords(
  table: any,
  timestampField: any,
  days: number | undefined,
  dryRun: boolean,
  label: string,
): Promise<void> {
  if (!days || days <= 0) {
    logger.debug({ label }, `Retention disabled for ${label}`);
    return;
  }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const db = getDatabase() as unknown as NodePgDatabase<typeof schema>;

  const expired = await db
    .select({ id: table.id })
    .from(table)
    .where(lt(timestampField, cutoff))
    .limit(1000);

  if (expired.length === 0) {
    logger.debug({ label }, `No expired ${label} found`);
    return;
  }

  logger.info({ count: expired.length, label }, `Found expired ${label}`);

  if (dryRun) {
    logger.info(
      { count: expired.length, label },
      `[DRY RUN] Would delete ${expired.length} ${label}`,
    );
    return;
  }

  try {
    await db.delete(table).where(
      inArray(
        table.id,
        expired.map((r) => r.id),
      ),
    );
    logger.info({ count: expired.length, label }, `Deleted expired ${label}`);
  } catch (err) {
    logger.error({ err, label }, `Failed to delete expired ${label}`);
  }
}

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
    await deleteExpiredRecords(
      messagesTable,
      messagesTable.created_at,
      config.RETENTION_MESSAGES_DAYS,
      dryRun,
      "messages",
    );
    await deleteExpiredRecords(
      attachmentsTable,
      attachmentsTable.created_at,
      config.RETENTION_ATTACHMENTS_DAYS,
      dryRun,
      "attachments",
    );
    await deleteExpiredRecords(
      voiceRecordingsTable,
      voiceRecordingsTable.created_at,
      config.RETENTION_VOICE_DAYS,
      dryRun,
      "voice recordings",
    );
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

  // Initialize Voice PCM WebSocket client (bypasses Redis for real-time audio)
  let pcmWsClient: VoicePcmWsClient | undefined;
  if (config.VOICE_PCM_WS_ENABLED && config.BACKEND_WS_TOKEN) {
    pcmWsClient = new VoicePcmWsClient(
      config.BACKEND_WS_URL,
      config.BACKEND_WS_TOKEN,
    );
    pcmWsClient.connect();
    setPcmWsClient(pcmWsClient);
    logger.info({ url: config.BACKEND_WS_URL }, "Voice PCM WS client enabled");
  } else if (config.VOICE_PCM_WS_ENABLED && !config.BACKEND_WS_TOKEN) {
    logger.warn(
      "VOICE_PCM_WS_ENABLED=true but BACKEND_WS_TOKEN is empty — falling back to Redis for PCM",
    );
  } else {
    logger.info("Voice PCM WS disabled — using Redis for PCM");
  }

  const gracefulShutdown = createGracefulShutdown({
    logger,
    closeDatabase,
    voiceController,
    client,
    eventBroadcaster,
    commandHandler,
    stopMetricsServer,
    pcmWsClient,
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
    setModerationEventBroadcaster(eventBroadcaster);
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
      const pool = workerPool as unknown as {
        _poolState?: { size: number; active: number };
      };
      if (pool._poolState) {
        setGauge("ai_analysis_worker_threads", pool._poolState.size);
        setGauge("ai_analysis_worker_threads_active", pool._poolState.active);
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
