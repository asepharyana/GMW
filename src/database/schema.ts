import {
  bigint as pgBigint,
  boolean as pgBoolean,
  foreignKey as pgForeignKey,
  index as pgIndex,
  integer as pgInteger,
  real as pgReal,
  pgTable,
  text as pgText,
} from "drizzle-orm/pg-core";

// PostgreSQL Schema
// ==================

/**
 * Muxer Jobs Table (PostgreSQL)
 * Tracks audio post-processing jobs with status and retry logic
 */
export const pgMuxerJobsTable = pgTable(
  "muxer_jobs",
  {
    id: pgText("id").primaryKey(),
    data: pgText("data").notNull(),
    status: pgText("status", {
      enum: ["pending", "processing", "completed", "failed"],
    })
      .notNull()
      .default("pending"),
    attempts: pgInteger("attempts").notNull().default(0),
    maxAttempts: pgInteger("maxAttempts").notNull().default(3),
    createdAt: pgBigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: pgBigint("updatedAt", { mode: "number" }).notNull(),
    error: pgText("error"),
  },
  (table) => ({
    statusIdx: pgIndex("idx_muxer_jobs_status").on(table.status),
    createdAtIdx: pgIndex("idx_muxer_jobs_createdAt").on(table.createdAt),
  }),
);

/**
 * Messages Table (PostgreSQL)
 * Stores text messages with AI moderation analysis
 */
export const pgMessagesTable = pgTable(
  "messages",
  {
    id: pgText("id").primaryKey(),
    guild_id: pgText("guild_id").notNull(),
    channel_id: pgText("channel_id").notNull(),
    thread_id: pgText("thread_id"),
    user_id: pgText("user_id").notNull(),
    username: pgText("username").notNull(),
    avatar_url: pgText("avatar_url"),
    content: pgText("content").notNull(),
    edited_content: pgText("edited_content"),
    created_at: pgBigint("created_at", { mode: "number" }).notNull(),
    edited_at: pgBigint("edited_at", { mode: "number" }),
    deleted_at: pgBigint("deleted_at", { mode: "number" }),
    type: pgText("type", { enum: ["text", "edited", "deleted"] })
      .notNull()
      .default("text"),
    metadata: pgText("metadata"),
    ai_status: pgText("ai_status", {
      enum: ["pending", "clean", "warn", "flagged", "error"],
    })
      .notNull()
      .default("pending"),
    ai_moderation_flags: pgText("ai_moderation_flags"),
    ai_moderation_score: pgReal("ai_moderation_score"),
    ai_analysis: pgText("ai_analysis"),
    ai_categories: pgText("ai_categories"),
    ai_severity: pgText("ai_severity", {
      enum: ["none", "low", "medium", "high", "critical"],
    }),
    ai_confidence: pgReal("ai_confidence"),
    ai_recommended_action: pgText("ai_recommended_action", {
      enum: ["none", "monitor", "warn", "review", "delete", "escalate"],
    }),
    ai_analyzed_at: pgBigint("ai_analyzed_at", { mode: "number" }),
    ai_error: pgText("ai_error"),
  },
  (table) => ({
    channelIdx: pgIndex("idx_messages_channel").on(table.channel_id),
    userIdx: pgIndex("idx_messages_user").on(table.user_id),
    createdIdx: pgIndex("idx_messages_created").on(table.created_at),
    threadIdx: pgIndex("idx_messages_thread").on(table.thread_id),
    channelCreatedIdx: pgIndex("idx_messages_channel_created").on(
      table.channel_id,
      table.created_at,
      table.id,
    ),
    threadCreatedIdx: pgIndex("idx_messages_thread_created").on(
      table.thread_id,
      table.created_at,
      table.id,
    ),
    aiStatusCreatedIdx: pgIndex("idx_messages_ai_status_created").on(
      table.ai_status,
      table.created_at,
      table.id,
    ),
    guildAiStatusCreatedIdx: pgIndex("idx_messages_guild_ai_status_created").on(
      table.guild_id,
      table.ai_status,
      table.created_at,
      table.id,
    ),
    guildCreatedDeletedIdx: pgIndex("idx_messages_guild_created_deleted").on(
      table.guild_id,
      table.created_at,
      table.deleted_at,
      table.id,
    ),
    channelAiStatusCreatedIdx: pgIndex(
      "idx_messages_channel_ai_status_created",
    ).on(table.channel_id, table.ai_status, table.created_at, table.id),
    threadAiStatusCreatedIdx: pgIndex(
      "idx_messages_thread_ai_status_created",
    ).on(table.thread_id, table.ai_status, table.created_at, table.id),
  }),
);

/**
 * Attachments Table (PostgreSQL)
 * Stores attachment metadata with upload status tracking
 */
export const pgAttachmentsTable = pgTable(
  "attachments",
  {
    id: pgText("id").primaryKey(),
    message_id: pgText("message_id").notNull(),
    guild_id: pgText("guild_id").notNull(),
    channel_id: pgText("channel_id").notNull(),
    thread_id: pgText("thread_id"),
    user_id: pgText("user_id").notNull(),
    filename: pgText("filename").notNull(),
    size: pgInteger("size").notNull(),
    type: pgText("type").notNull(),
    discord_url: pgText("discord_url").notNull(),
    uploaded_url: pgText("uploaded_url"),
    upload_status: pgText("upload_status", {
      enum: ["pending", "uploaded", "failed"],
    })
      .notNull()
      .default("pending"),
    upload_error: pgText("upload_error"),
    created_at: pgBigint("created_at", { mode: "number" }).notNull(),
    uploaded_at: pgBigint("uploaded_at", { mode: "number" }),
  },
  (table) => ({
    channelIdx: pgIndex("idx_attachments_channel").on(table.channel_id),
    messageIdx: pgIndex("idx_attachments_message").on(table.message_id),
    statusIdx: pgIndex("idx_attachments_status").on(table.upload_status),
    channelCreatedIdx: pgIndex("idx_attachments_channel_created").on(
      table.channel_id,
      table.created_at,
      table.id,
    ),
    threadCreatedIdx: pgIndex("idx_attachments_thread_created").on(
      table.thread_id,
      table.created_at,
      table.id,
    ),
    messageFk: pgForeignKey({
      columns: [table.message_id],
      foreignColumns: [pgMessagesTable.id],
      name: "fk_attachments_message_id",
    }).onDelete("cascade"),
  }),
);

/**
 * UI State Table (PostgreSQL)
 * Stores persistent UI state (e.g., selected channel, filter preferences)
 */
export const pgUIStateTable = pgTable("ui_state", {
  key: pgText("key").primaryKey(),
  value: pgText("value").notNull(),
  updated_at: pgBigint("updated_at", { mode: "number" }).notNull(),
});

/**
 * AI Analysis Runs Table (PostgreSQL)
 * Tracks AI analysis batch runs for conversation-level moderation
 */
export const pgAIAnalysisRunsTable = pgTable(
  "ai_analysis_runs",
  {
    id: pgText("id").primaryKey(),
    conversation_key: pgText("conversation_key").notNull(),
    target_message_ids: pgText("target_message_ids").notNull(), // JSON array
    model: pgText("model").notNull(),
    request_tokens_estimate: pgInteger("request_tokens_estimate"),
    response_raw: pgText("response_raw"),
    status: pgText("status", {
      enum: ["pending", "processing", "completed", "failed"],
    })
      .notNull()
      .default("pending"),
    error: pgText("error"),
    created_at: pgBigint("created_at", { mode: "number" }).notNull(),
    completed_at: pgBigint("completed_at", { mode: "number" }),
  },
  (table) => ({
    conversationKeyIdx: pgIndex("idx_ai_analysis_runs_conversation_key").on(
      table.conversation_key,
    ),
    statusIdx: pgIndex("idx_ai_analysis_runs_status").on(table.status),
    createdAtIdx: pgIndex("idx_ai_analysis_runs_created_at").on(
      table.created_at,
    ),
  }),
);

/**
 * Voice Recordings Table (PostgreSQL)
 * Stores voice recording segment metadata and upload status
 */
export const pgVoiceRecordingsTable = pgTable(
  "voice_recordings",
  {
    id: pgText("id").primaryKey(),
    user_id: pgText("user_id").notNull(),
    username: pgText("username").notNull(),
    avatar_url: pgText("avatar_url"),
    guild_id: pgText("guild_id"),
    channel_id: pgText("channel_id"),
    channel_name: pgText("channel_name"),
    filename: pgText("filename").notNull(),
    size_bytes: pgInteger("size_bytes").notNull(),
    download_url: pgText("download_url"),
    upload_status: pgText("upload_status", {
      enum: ["pending", "uploaded", "failed"],
    })
      .notNull()
      .default("pending"),
    upload_error: pgText("upload_error"),
    created_at: pgBigint("created_at", { mode: "number" }).notNull(),
    uploaded_at: pgBigint("uploaded_at", { mode: "number" }),
  },
  (table) => ({
    userIdIdx: pgIndex("idx_voice_recordings_user_id").on(table.user_id),
    channelIdIdx: pgIndex("idx_voice_recordings_channel_id").on(
      table.channel_id,
    ),
    createdIdx: pgIndex("idx_voice_recordings_created_at").on(table.created_at),
  }),
);

/**
 * Message Reviews Table (PostgreSQL)
 * Tracks manual reviews of messages flagged by AI moderation
 */
export const pgMessageReviewsTable = pgTable(
  "message_reviews",
  {
    id: pgText("id").primaryKey(),
    message_id: pgText("message_id").notNull(),
    guild_id: pgText("guild_id").notNull(),
    channel_id: pgText("channel_id").notNull(),
    reviewer_id: pgText("reviewer_id"),
    status: pgText("status", {
      enum: ["pending", "approved", "rejected", "escalated"],
    })
      .notNull()
      .default("pending"),
    notes: pgText("notes"),
    created_at: pgBigint("created_at", { mode: "number" }).notNull(),
    reviewed_at: pgBigint("reviewed_at", { mode: "number" }),
  },
  (table) => ({
    messageIdIdx: pgIndex("idx_message_reviews_message_id").on(
      table.message_id,
    ),
    statusIdx: pgIndex("idx_message_reviews_status").on(table.status),
    createdAtIdx: pgIndex("idx_message_reviews_created_at").on(
      table.created_at,
    ),
    guildStatusIdx: pgIndex("idx_message_reviews_guild_status").on(
      table.guild_id,
      table.status,
      table.created_at,
    ),
  }),
);

/**
 * Moderation Actions Table (PostgreSQL)
 * Tracks actions taken on messages (delete, mute, etc.)
 */
export const pgModerationActionsTable = pgTable(
  "moderation_actions",
  {
    id: pgText("id").primaryKey(),
    message_id: pgText("message_id"),
    user_id: pgText("user_id"),
    guild_id: pgText("guild_id").notNull(),
    action_type: pgText("action_type", {
      enum: [
        "delete_message",
        "mute_user",
        "warn_user",
        "kick_user",
        "ban_user",
      ],
    }).notNull(),
    reason: pgText("reason"),
    executed_by: pgText("executed_by"),
    status: pgText("status", {
      enum: ["pending", "executed", "failed"],
    })
      .notNull()
      .default("pending"),
    error: pgText("error"),
    created_at: pgBigint("created_at", { mode: "number" }).notNull(),
    executed_at: pgBigint("executed_at", { mode: "number" }),
  },
  (table) => ({
    messageIdIdx: pgIndex("idx_moderation_actions_message_id").on(
      table.message_id,
    ),
    userIdIdx: pgIndex("idx_moderation_actions_user_id").on(table.user_id),
    statusIdx: pgIndex("idx_moderation_actions_status").on(table.status),
    guildStatusIdx: pgIndex("idx_moderation_actions_guild_status").on(
      table.guild_id,
      table.status,
      table.created_at,
    ),
  }),
);

/**
 * Retention Policies Table (PostgreSQL)
 * Defines data retention rules per guild/channel
 */
export const pgRetentionPoliciesTable = pgTable(
  "retention_policies",
  {
    id: pgText("id").primaryKey(),
    guild_id: pgText("guild_id").notNull(),
    channel_id: pgText("channel_id"),
    retention_days: pgInteger("retention_days").notNull().default(90),
    apply_to_media: pgBoolean("apply_to_media").notNull().default(true),
    apply_to_voice: pgBoolean("apply_to_voice").notNull().default(true),
    enabled: pgBoolean("enabled").notNull().default(true),
    created_at: pgBigint("created_at", { mode: "number" }).notNull(),
    updated_at: pgBigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => ({
    guildIdIdx: pgIndex("idx_retention_policies_guild_id").on(table.guild_id),
    enabledIdx: pgIndex("idx_retention_policies_enabled").on(table.enabled),
  }),
);

/**
 * Word Analysis Cache Table (PostgreSQL)
 * Caches per-word moderation analysis results so repeated words reuse
 * previously computed API / fallback results instead of re-calling
 * expensive LLM or external moderation APIs.
 */
export const pgWordAnalysisCacheTable = pgTable(
  "word_analysis_cache",
  {
    /** Normalized word (lowercase, trimmed) — primary key. */
    word: pgText("word").primaryKey(),
    /** JSON array of moderation flags detected for this word (e.g. ["vulgar_language","harassment"]). */
    flags: pgText("flags").notNull().default("[]"),
    /** Which source produced this result: "local" | "nvidia" | "primary_ai" | "groq". */
    source: pgText("source", {
      enum: ["local", "nvidia", "primary_ai", "groq"],
    })
      .notNull()
      .default("local"),
    /** Epoch millis when the analysis was stored. */
    analyzed_at: pgBigint("analyzed_at", { mode: "number" }).notNull(),
    /** Epoch millis when this cache entry expires. */
    expires_at: pgBigint("expires_at", { mode: "number" }).notNull(),
    /** How many times this cached word has been reused. */
    hit_count: pgInteger("hit_count").notNull().default(0),
  },
  (table) => ({
    expiresAtIdx: pgIndex("idx_word_analysis_cache_expires_at").on(
      table.expires_at,
    ),
    sourceIdx: pgIndex("idx_word_analysis_cache_source").on(table.source),
  }),
);

// Runtime table exports
// =====================

export const muxerJobsTable = pgMuxerJobsTable;
export const messagesTable = pgMessagesTable;
export const attachmentsTable = pgAttachmentsTable;
export const uiStateTable = pgUIStateTable;
export const aiAnalysisRunsTable = pgAIAnalysisRunsTable;
export const voiceRecordingsTable = pgVoiceRecordingsTable;
export const messageReviewsTable = pgMessageReviewsTable;
export const moderationActionsTable = pgModerationActionsTable;
export const retentionPoliciesTable = pgRetentionPoliciesTable;
export const wordAnalysisCacheTable = pgWordAnalysisCacheTable;

// Export table types for use in queries
export type MuxerJob = typeof muxerJobsTable.$inferSelect;
export type MuxerJobInsert = typeof muxerJobsTable.$inferInsert;

export type Message = typeof messagesTable.$inferSelect;
export type MessageInsert = typeof messagesTable.$inferInsert;

export type Attachment = typeof attachmentsTable.$inferSelect;
export type AttachmentInsert = typeof attachmentsTable.$inferInsert;

export type UIState = typeof uiStateTable.$inferSelect;
export type UIStateInsert = typeof uiStateTable.$inferInsert;

export type AIAnalysisRun = typeof aiAnalysisRunsTable.$inferSelect;
export type AIAnalysisRunInsert = typeof aiAnalysisRunsTable.$inferInsert;

export type VoiceRecording = typeof voiceRecordingsTable.$inferSelect;
export type VoiceRecordingInsert = typeof voiceRecordingsTable.$inferInsert;

export type MessageReview = typeof messageReviewsTable.$inferSelect;
export type MessageReviewInsert = typeof messageReviewsTable.$inferInsert;

export type ModerationAction = typeof moderationActionsTable.$inferSelect;
export type ModerationActionInsert = typeof moderationActionsTable.$inferInsert;

export type RetentionPolicy = typeof retentionPoliciesTable.$inferSelect;
export type RetentionPolicyInsert = typeof retentionPoliciesTable.$inferInsert;
