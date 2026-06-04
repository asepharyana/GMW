import "dotenv/config";
import { z } from "zod";

const configSchema = z
  .object({
    // Server
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

    // Database
    DATABASE_URL: z.string().url().optional(),
    DATABASE_HOST: z.string().default("localhost"),
    DATABASE_PORT: z.coerce.number().default(5432),
    DATABASE_NAME: z.string().default("discord_moderation"),
    DATABASE_USER: z.string().default("postgres"),
    DATABASE_PASSWORD: z.string().optional(),

    // Redis (optional, for pub/sub)
    REDIS_URL: z.string().url().optional(),
    REDIS_HOST: z.string().default("localhost"),
    REDIS_PORT: z.coerce.number().default(6379),

    // Discord
    MONITOR_GUILD_ID: z.string().min(1).optional(),

    // Admin
    ADMIN_PASSWORD: z.string().optional(),

    // Analytics
    BACKLOG_SYNC_HOURS: z.coerce.number().positive().default(24),
    BACKLOG_SYNC_BATCH_SIZE: z.coerce
      .number()
      .int()
      .positive()
      .max(100)
      .default(100),

    // AI Moderation
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
    AI_LLM_MODEL: z.string().default("text"),
    AI_LLM_VISION_MODEL: z.string().optional(),
    AI_LLM_MAX_CONCURRENT: z.coerce.number().int().positive().default(5),
    AI_LLM_IMAGE_MAX_DIMENSION: z.coerce
      .number()
      .int()
      .positive()
      .default(1024),
    AI_LLM_TEXT_BATCH_SIZE: z.coerce.number().int().positive().default(20),
    AI_LLM_MEDIA_ANALYSIS_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(60000),

    // Attachments
    ATTACHMENT_UPLOAD_TIMEOUT_MS: z.coerce.number().positive().default(30000),
    ATTACHMENT_MAX_SIZE_MB: z.coerce.number().positive().default(100),
    ATTACHMENT_RETRY_ATTEMPTS: z.coerce.number().positive().default(3),
    TELE_UPLOAD_URL: z
      .string()
      .url()
      .default("https://upload.asepharyana.my.id/api/upload"),
  })
  .parse(process.env);

export const config = configSchema;
export type Config = typeof config;
