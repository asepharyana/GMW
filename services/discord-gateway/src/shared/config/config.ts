import "dotenv/config";
import { z } from "zod";
import { ConfigError } from "../errors/errors.js";

const configSchema = z
  .object({
    DISCORD_TOKEN: z
      .string()
      .min(1, "DISCORD_TOKEN is required")
      .transform((value) => value.replace(/^("|')|(?:("|'))$/g, "")),
    VOICE_CHANNEL_ID: z.string().min(1).optional(),
    GUILD_ID: z.string().min(1).optional(),
    TEXT_GUILD_ID: z.string().min(1).optional(),
    TEXT_CHANNEL_ID: z.string().min(1).optional(),
    VOICE_GUILD_ID: z.string().min(1).optional(),
    VERBOSE: z
      .string()
      .optional()
      .transform((v) => v === "true")
      .default(false),
    RECORDINGS_DIR: z.string().default("./recordings"),
    RECORDING_SEGMENT_MS: z.coerce.number().positive().default(5000),
    DECODER_ROTATE_MS: z.coerce.number().positive().default(5000),
    DECODER_COOLDOWN_MS: z.coerce.number().positive().default(0),
    WEBSERVER_PORT: z.coerce.number().positive().default(3000),
    VOICE_CONNECTION_TIMEOUT_MS: z.coerce.number().positive().default(15000),
    RECONNECT_TIMEOUT_MS: z.coerce.number().positive().default(5000),
    AUDIO_STREAM_SILENCE_DURATION_MS: z.coerce
      .number()
      .positive()
      .default(3000),
    PACKET_FILTER_MIN_SIZE: z.coerce.number().positive().default(8),
    OPUS_FRAME_SIZE: z.coerce.number().positive().default(960),
    AUDIO_SAMPLE_RATE: z.coerce.number().positive().default(48000),
    AUDIO_CHANNELS: z.coerce.number().positive().default(2),
    AVATAR_SIZE: z.coerce.number().positive().default(64),
    LOG_LEVEL: z
      .enum(["error", "warn", "info", "http", "verbose", "debug", "silly"])
      .default("info"),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    MONITOR_GUILD_ID: z.string().min(1).optional(),
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
    AI_ANALYSIS_ENABLED: z
      .string()
      .optional()
      .transform((v) => v === "true")
      .default(false),
    OPENAI_MODERATION_API_KEY: z.string().optional(),
    OPENAI_MODERATION_BASE_URL: z
      .string()
      .url()
      .default("https://api.openai.com/v1"),
    OPENAI_MODERATION_MODEL: z.string().default("omni-moderation-latest"),
    AI_LLM_API_KEY: z.string().optional(),
    AI_LLM_BASE_URL: z
      .string()
      .url()
      .default("https://9router.asepharyana.my.id/v1"),
    /** Model used for text-only moderation (messages, badword analysis). */
    AI_LLM_MODEL: z.string().default("text"),
    /** Model used for image/video moderation (vision-capable model). */
    AI_LLM_VISION_MODEL: z.string().optional(),
    /** Max concurrent LLM API calls (default: 5). */
    AI_LLM_MAX_CONCURRENT: z.coerce.number().int().positive().default(5),
    /** Maximum image dimension in pixels before resize for vision API (default: 1024). */
    AI_LLM_IMAGE_MAX_DIMENSION: z.coerce
      .number()
      .int()
      .positive()
      .default(1024),
    /** Maximum messages per text-only moderation batch (default: 20). */
    AI_LLM_TEXT_BATCH_SIZE: z.coerce.number().int().positive().default(20),
    /** Timeout in ms for individual media analysis calls (default: 60000). */
    AI_LLM_MEDIA_ANALYSIS_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(60000),
    AI_ANALYSIS_DEBOUNCE_MS: z.coerce.number().positive().default(500),
    AI_ANALYSIS_RECOVERY_INTERVAL_MS: z.coerce
      .number()
      .positive()
      .default(15000),
    AI_ANALYSIS_ERROR_COOLDOWN_MS: z.coerce.number().positive().default(30000),
    /** Max messages fetched per conversation batch (token budget is the real constraint). */
    AI_ANALYSIS_MAX_BATCH_SIZE: z.coerce.number().int().positive().default(200),
    AI_ANALYSIS_MAX_CONTEXT_TOKENS: z.coerce.number().positive().default(8000),
    /** Token budget for target messages specifically (separate from context window). */
    AI_ANALYSIS_MAX_TARGET_TOKENS: z.coerce.number().positive().default(4000),
    AI_ANALYSIS_CONTEXT_MESSAGE_LIMIT: z.coerce
      .number()
      .int()
      .positive()
      .default(20),
    /**
     * How long a conversation is considered locked while being processed.
     * Must exceed (LLM timeout × max retries) + network overhead.
     * LLM client timeout=30s, retries=3 → minimum safe value ≈ 100s.
     */
    AI_ANALYSIS_PROCESSING_TIMEOUT_MS: z.coerce
      .number()
      .positive()
      .default(120000),
    /** Max concurrent individual-fallback jobs admitted by the main event loop. */
    AI_ANALYSIS_INDIVIDUAL_MAX_CONCURRENT: z.coerce
      .number()
      .int()
      .positive()
      .default(50),
    /**
     * How many consecutive individual-fallback errors trigger the individual
     * circuit breaker (separate from the batch circuit breaker).
     */
    AI_ANALYSIS_INDIVIDUAL_CB_THRESHOLD: z.coerce
      .number()
      .int()
      .positive()
      .default(50),
    /** Max Piscina worker threads for batch AI analysis (default: os.availableParallelism). */
    PISCINA_MAX_THREADS: z.coerce.number().int().positive().optional(),
    // AI moderation uses the Primary LLM (AI_LLM_*) endpoint only.
    // No NVIDIA or Groq fallback.
    AUTO_DELETE_FLAGGED_ENABLED: z
      .string()
      .optional()
      .transform((v) => v === "true")
      .default(true),
    AUTO_DELETE_FLAGGED_DELAY_MS: z.coerce.number().min(0).default(0),
    AUTO_DELETE_FLAGGED_DRY_RUN: z
      .string()
      .optional()
      .transform((v) => v === "true")
      .default(false),
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
    DATABASE_URL: z.string().optional(),
    POSTGRES_HOST: z.string().default("localhost"),
    POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
    POSTGRES_USER: z.string().optional(),
    POSTGRES_PASSWORD: z.string().optional(),
    POSTGRES_DB: z.string().optional(),
    POSTGRES_POOL_MIN: z.coerce.number().int().positive().default(2),
    POSTGRES_POOL_MAX: z.coerce.number().int().positive().default(10),
    ADMIN_PASSWORD: z.string().default("admin123"),
    REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  })
  .superRefine((value, ctx) => {
    if (!value.AI_ANALYSIS_ENABLED) {
      // Continue to database validationa
    } else if (!value.AI_LLM_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AI_LLM_API_KEY"],
        message: "AI_LLM_API_KEY is required when AI_ANALYSIS_ENABLED=true",
      });
    }

    // Validate PostgreSQL configuration
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
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  try {
    const parsed = configSchema.parse(env);
    return {
      ...parsed,
      // AI text capture and analytics are pinned to the monitor guild.
      EFFECTIVE_TEXT_GUILD_ID: parsed.MONITOR_GUILD_ID,
      EFFECTIVE_VOICE_GUILD_ID: parsed.VOICE_GUILD_ID ?? parsed.GUILD_ID,
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

export const config = loadConfig();
