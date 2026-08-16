/**
 * Unified configuration schema shared by all services.
 *
 * This is the single source of truth for all environment variables.
 * Individual services re-export from here; they do NOT define their own schemas.
 */

import { z } from "zod";
import { ConfigError } from "../errors/index.js";

export const configSchema = z
  .object({
    // ── Discord ──────────────────────────────────────────────────────────
    DISCORD_TOKEN: z
      .string()
      .min(1, "DISCORD_TOKEN is required")
      .transform((value) => value.replace(/^("|')|(?:("|'))$/g, "")),
    MONITOR_GUILD_IDS: z
      .string()
      .default("")
      .transform((v) => v.split(",").filter(Boolean)),
    MONITOR_GUILD_ID: z.string().min(1).optional(),
    TEXT_GUILD_ID: z.string().min(1).optional(),
    TEXT_CHANNEL_ID: z.string().min(1).optional(),
    EXCLUDED_CHANNEL_IDS: z
      .string()
      .default("")
      .transform((v) => v.split(",").filter(Boolean))
      .describe("Channel IDs to exclude from capture"),
    EXCLUDED_THREAD_IDS: z
      .string()
      .default("")
      .transform((v) => v.split(",").filter(Boolean))
      .describe("Thread IDs to exclude from capture"),
    BOT_EXCLUDED_CHANNEL_IDS: z
      .string()
      .default("1206269771340058694")
      .transform((v) => v.split(",").filter(Boolean))
      .describe(
        "Channel IDs where bot messages are NOT captured/analyzed (bot detection stays on everywhere else)",
      ),

    // ── Legacy voice ─────────────────────────────────────────────────────
    VOICE_GUILD_ID: z.string().min(1).optional(),
    VOICE_CHANNEL_ID: z.string().min(1).optional(),

    // ── Recording ────────────────────────────────────────────────────────
    RECORDINGS_DIR: z.string().default("./recordings"),
    RECORDING_SEGMENT_MS: z.coerce.number().positive().default(5000),

    // ── Decoder ──────────────────────────────────────────────────────────
    DECODER_ROTATE_MS: z.coerce.number().positive().default(5000),
    DECODER_COOLDOWN_MS: z.coerce.number().positive().default(30000),

    // ── Audio ────────────────────────────────────────────────────────────
    AUDIO_STREAM_SILENCE_DURATION_MS: z.coerce
      .number()
      .positive()
      .default(3000),
    PACKET_FILTER_MIN_SIZE: z.coerce.number().positive().default(8),
    OPUS_FRAME_SIZE: z.coerce.number().positive().default(960),
    AUDIO_SAMPLE_RATE: z.coerce.number().positive().default(48000),
    AUDIO_CHANNELS: z.coerce.number().positive().default(2),
    AVATAR_SIZE: z.coerce.number().positive().default(64),

    // ── Server ───────────────────────────────────────────────────────────
    WEBSERVER_PORT: z.coerce.number().positive().default(3001),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    LOG_LEVEL: z
      .enum(["error", "warn", "info", "http", "verbose", "debug", "silly"])
      .default("info"),
    VERBOSE: z
      .string()
      .optional()
      .transform((v) => v === "true")
      .default(false),
    ADMIN_PASSWORD: z.string().default("admin123"),
    WEBHOOK_URLS: z
      .string()
      .default("")
      .transform((v) => v.split(",").filter(Boolean)),
    WEBHOOK_EVENTS: z
      .string()
      .default("message_flagged,auto_deleted,high_severity")
      .transform((v) => v.split(",").filter(Boolean)),
    METRICS_PORT: z.coerce.number().positive().default(9090),

    // ── Database (PostgreSQL) ────────────────────────────────────────────
    DATABASE_URL: z.string().optional(),
    POSTGRES_HOST: z.string().default("localhost"),
    POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
    POSTGRES_USER: z.string().optional(),
    POSTGRES_PASSWORD: z.string().optional(),
    POSTGRES_DB: z.string().optional(),
    // Idle-pool floor. Kept at 0 so the gateway (main + 4 Piscina worker
    // threads, each owning its own pg Pool) does not hold ~10 permanently
    // open idle connections to PgBouncer. The pool still grows on demand up
    // to POSTGRES_POOL_MAX; min:0 only drops idle clients after
    // idleTimeoutMillis. This both trims RSS and frees PgBouncer slots.
    POSTGRES_POOL_MIN: z.coerce.number().int().min(0).default(0),
    POSTGRES_POOL_MAX: z.coerce.number().int().positive().default(10),

    // ── Redis ────────────────────────────────────────────────────────────
    REDIS_URL: z.string().default("redis://localhost:6379"),
    // ── SearXNG ───────────────────────────────────────────────────────────
    // Instance for web search + term glossary lookups. Override when the
    // default instance is down/rate-limited.
    SEARXNG_BASE_URL: z.string().url().default("https://searxng.imrnes.team"),
    // ── Voice PCM WebSocket (direct gateway→backend, bypasses Redis) ────
    VOICE_PCM_WS_ENABLED: z
      .string()
      .optional()
      .transform((v) => v === "true")
      .default(true),
    BACKEND_WS_URL: z.string().default("ws://backend:3000/ws"),
    BACKEND_WS_TOKEN: z.string().optional().default(""),

    // ── Connection ───────────────────────────────────────────────────────
    VOICE_CONNECTION_TIMEOUT_MS: z.coerce.number().positive().default(15000),
    RECONNECT_TIMEOUT_MS: z.coerce.number().positive().default(5000),

    // ── Attachments ─────────────────────────────────────────────────────
    TELE_UPLOAD_URL: z
      .string()
      .url()
      .default("https://upload.asepharyana.my.id/api/upload"),
    ATTACHMENT_UPLOAD_TIMEOUT_MS: z.coerce.number().positive().default(30000),
    ATTACHMENT_MAX_SIZE_MB: z.coerce.number().positive().default(100),
    ATTACHMENT_RETRY_ATTEMPTS: z.coerce.number().positive().default(3),
    BACKLOG_SYNC_HOURS: z.coerce.number().positive().default(24),
    BACKLOG_SYNC_BATCH_SIZE: z.coerce
      .number()
      .int()
      .positive()
      .max(100)
      .default(100),

    // ── AI Analysis ─────────────────────────────────────────────────────
    AI_ANALYSIS_ENABLED: z
      .string()
      .optional()
      .transform((v) => v === "true")
      .default(false),
    AI_LLM_API_KEY: z.string().optional(),
    AI_LLM_BASE_URL: z
      .string()
      .url()
      .default("https://9router.asepharyana.my.id/v1"),
    AI_LLM_MODEL: z.string().default("text"),
    // Vision uses the SAME router/base URL as text moderation
    // (AI_LLM_BASE_URL) but a different model alias. The dedicated NVIDIA
    // multimodal endpoint was removed.
    AI_LLM_VISION_MODEL: z.string().default("multimodal"),
    AI_LLM_DISABLE_THINKING: z
      .string()
      .default("true")
      .transform((v) => v === "true")
      .describe(
        "Disable LLM chain-of-thought (reasoning/thinking) to speed up AI analysis. Set false to restore thinking.",
      ),
    AI_LLM_EMBEDDING_MODEL: z.string().optional(),
    AI_LLM_EMBEDDING_MIN_SIMILARITY: z.coerce
      .number()
      .min(0)
      .max(1)
      .default(0.97),
    AI_LLM_EMBEDDING_MAX_CANDIDATES: z.coerce
      .number()
      .int()
      .positive()
      .default(30),
    // Qdrant vector store for the semantic moderation cache. When
    // QDRANT_URL is set, embeddings are stored/searched there (Postgres
    // embedding column remains as a legacy fallback).
    QDRANT_URL: z.string().optional(),
    QDRANT_COLLECTION: z.string().default("gmw_text_moderation"),
    QDRANT_API_KEY: z.string().optional(),
    AI_LLM_MAX_CONCURRENT: z.coerce.number().int().positive().default(8),
    AI_LLM_IMAGE_MAX_DIMENSION: z.coerce
      .number()
      .int()
      .positive()
      .default(1024),
    AI_LLM_TEXT_BATCH_SIZE: z.coerce.number().int().positive().default(60),
    AI_LLM_MEDIA_ANALYSIS_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(60000),
    // Standalone image/sticker/emoji vision analysis (analyzeSingleMediaImage
    // → llmVision → llmChat). Decoupled from the media *batch* timeout above so
    // a single vision call can be tuned independently. 1 minute by default —
    // vision models (especially behind a router) need headroom for large images.
    AI_LLM_VISION_ANALYSIS_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(60000),
    // Text-only moderation batches are cheaper than media (no downloads /
    // vision pre-pass), so they get their own (shorter) timeout instead of
    // being tied to the media budget.
    AI_LLM_TEXT_ANALYSIS_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(45000),
    // Term glossary — per-word Wikipedia lookups (via SearXNG) for words the
    // LLM may not know (slang, jargon, regional language, foreign terms).
    // Definitions are cached (in-memory + Redis) so repeat lookups are fast.
    // Disable to skip glossary lookups entirely and analyze without them.
    AI_GLOSSARY_ENABLED: z
      .string()
      .optional()
      .transform((v) => v === "true")
      .default(true),
    // Max glossary terms looked up per analysis batch (keeps latency bounded).
    AI_GLOSSARY_MAX_TERMS: z.coerce.number().int().min(1).max(20).default(6),
    // Per-user personal profile summaries (userProfileLearner). Disabled by
    // default: profiles bloat the analysis context and add LLM/DB cost for
    // little moderation signal — only <user_reputation> history is injected.
    AI_USER_PROFILE_LEARNING_ENABLED: z
      .string()
      .optional()
      .transform((v) => v === "true")
      .default(false),
    // Min word length for a term to be considered glossary-worthy.
    AI_GLOSSARY_MIN_WORD_LENGTH: z.coerce
      .number()
      .int()
      .min(2)
      .max(20)
      .default(5),

    // ── AI Analysis Timing ──────────────────────────────────────────────
    AI_ANALYSIS_DEBOUNCE_MS: z.coerce.number().positive().default(250),
    AI_ANALYSIS_RECOVERY_INTERVAL_MS: z.coerce
      .number()
      .positive()
      .default(10000),
    AI_ANALYSIS_ERROR_COOLDOWN_MS: z.coerce.number().positive().default(30000),

    // ── AI Analysis Batch ───────────────────────────────────────────────
    AI_ANALYSIS_MAX_BATCH_SIZE: z.coerce.number().int().positive().default(200),
    AI_ANALYSIS_MAX_CONTEXT_TOKENS: z.coerce.number().positive().default(8000),
    AI_ANALYSIS_MAX_TARGET_TOKENS: z.coerce.number().positive().default(14000),
    AI_ANALYSIS_CONTEXT_MESSAGE_LIMIT: z.coerce
      .number()
      .int()
      .positive()
      .default(20),
    // Recency gates for conversation context. A silence longer than GAP_MS
    // between context messages = the conversation restarted (older messages
    // dropped); MAX_AGE_MS caps how far back context is considered relevant.
    AI_ANALYSIS_CONTEXT_GAP_MS: z.coerce
      .number()
      .positive()
      .default(12 * 60 * 1000),
    AI_ANALYSIS_CONTEXT_MAX_AGE_MS: z.coerce
      .number()
      .positive()
      .default(45 * 60 * 1000),
    AI_ANALYSIS_PROCESSING_TIMEOUT_MS: z.coerce
      .number()
      .positive()
      .default(120000),
    AI_ANALYSIS_INDIVIDUAL_MAX_CONCURRENT: z.coerce
      .number()
      .int()
      .positive()
      .default(50),
    AI_ANALYSIS_INDIVIDUAL_CB_THRESHOLD: z.coerce
      .number()
      .int()
      .positive()
      .default(50),
    // Worker pool size. Default 4 (not availableParallelism) because each
    // Piscina thread owns its own pLimit(5) semaphore — on big VPSes
    // availableParallelism × 5 concurrent LLM calls would overwhelm the
    // router. Keep threads modest; concurrency is capped per-thread anyway.
    PISCINA_MAX_THREADS: z.coerce.number().int().positive().default(4),

    // ── Voice Transcription ────────────────────────────────────────────────
    AI_VOICE_TRANSCRIPTION_ENABLED: z
      .string()
      .optional()
      .transform((v) => v === "true")
      .default(false),

    // ── Auto Delete ─────────────────────────────────────────────────────
    AUTO_DELETE_FLAGGED_ENABLED: z
      .string()
      .optional()
      .transform((v) => v === "true")
      .default(true),
    AUTO_DELETE_FLAGGED_DRY_RUN: z
      .string()
      .optional()
      .transform((v) => v === "true")
      .default(false),
    AUTO_DELETE_FLAGGED_DELAY_MS: z.coerce.number().min(0).default(0),
    AUTO_DELETE_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.5),
    AUTO_DELETE_ALLOWED_SEVERITIES: z
      .string()
      .default("critical,high,medium,low"),
    AUTO_DELETE_ALLOWED_CATEGORIES: z.string().default(""),
    AUTO_DELETE_EXCLUDED_CHANNEL_IDS: z.string().default(""),
    AUTO_DELETE_EXCLUDED_USER_IDS: z.string().default(""),
    AUTO_DELETE_NOTIFY_USER: z
      .string()
      .optional()
      .transform((v) => v === "true")
      .default(false),
    AUTO_DELETE_LOG_CHANNEL_ID: z.string().default(""),

    // ── Nickname Reset (offensive_username enforcement) ────────────────
    // When the only violation is the member's server nickname, reset the
    // nickname to the default username instead of deleting the message.
    AUTO_NICKNAME_RESET_ENABLED: z
      .string()
      .optional()
      .transform((v) => v === "true")
      .default(true),
    AUTO_NICKNAME_RESET_COOLDOWN_MS: z.coerce
      .number()
      .positive()
      .default(10 * 60 * 1000),

    // ── Retention ───────────────────────────────────────────────────────
    RETENTION_MESSAGES_DAYS: z.coerce.number().int().min(0).default(0),
    RETENTION_ATTACHMENTS_DAYS: z.coerce.number().int().min(0).default(0),
    RETENTION_VOICE_DAYS: z.coerce.number().int().min(0).default(0),
    RETENTION_CLEANUP_INTERVAL_MS: z.coerce
      .number()
      .positive()
      .default(24 * 60 * 60 * 1000),
    RETENTION_DRY_RUN: z
      .string()
      .optional()
      .transform((v) => v === "true")
      .default(true),
    AUTO_MIGRATE_ON_STARTUP: z
      .string()
      .optional()
      .transform((v) => v === "true")
      .default(true),
  })
  .superRefine((value, ctx) => {
    if (!value.AI_ANALYSIS_ENABLED) {
      // skip: AI analysis not enabled
    } else if (!value.AI_LLM_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AI_LLM_API_KEY"],
        message: "AI_LLM_API_KEY is required when AI_ANALYSIS_ENABLED=true",
      });
    }

    // Validate database configuration
    if (!value.DATABASE_URL && !value.POSTGRES_HOST) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message: "Either DATABASE_URL or POSTGRES_HOST must be provided",
      });
    }
  });

export type AppConfig = z.infer<typeof configSchema> & {
  EFFECTIVE_TEXT_GUILD_ID?: string;
  EFFECTIVE_VOICE_GUILD_ID?: string;
  EFFECTIVE_MONITOR_GUILD_IDS: string[];
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  try {
    const parsed = configSchema.parse(env);
    return {
      ...parsed,
      EFFECTIVE_TEXT_GUILD_ID: parsed.TEXT_GUILD_ID ?? parsed.MONITOR_GUILD_ID,
      EFFECTIVE_VOICE_GUILD_ID: parsed.VOICE_GUILD_ID,
      EFFECTIVE_MONITOR_GUILD_IDS:
        parsed.MONITOR_GUILD_IDS.length > 0
          ? parsed.MONITOR_GUILD_IDS
          : parsed.MONITOR_GUILD_ID
            ? [parsed.MONITOR_GUILD_ID]
            : [],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join("\n");
      throw new ConfigError(`Configuration validation failed:\n${messages}`);
    }
    throw error;
  }
}

/** Singleton config loaded from process.env at import time. */
export const config = loadConfig();
