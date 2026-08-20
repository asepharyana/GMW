import {
  bigint as pgBigint,
  boolean as pgBoolean,
  foreignKey as pgForeignKey,
  index as pgIndex,
  integer as pgInteger,
  jsonb as pgJsonb,
  real as pgReal,
  pgTable,
  text as pgText,
  timestamp as pgTimestamp,
  uuid as pgUuid,
} from "drizzle-orm/pg-core";

// =============================================================================
// Messages
// =============================================================================

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
    is_reply: pgBoolean("is_reply"),
    is_forward: pgBoolean("is_forward"),
    is_crosspost: pgBoolean("is_crosspost"),
    reference_message_id: pgText("reference_message_id"),
    reference_channel_id: pgText("reference_channel_id"),
    reference_guild_id: pgText("reference_guild_id"),
    metadata: pgText("metadata"),
    ai_status: pgText("ai_status", {
      enum: ["pending", "processing", "clean", "warn", "flagged", "error"],
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
    ai_analysis_duration_ms: pgBigint("ai_analysis_duration_ms", {
      mode: "number",
    }),
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
    guildAiStatusAnalyzedIdx: pgIndex(
      "idx_messages_guild_ai_status_analyzed",
    ).on(table.guild_id, table.ai_status, table.ai_analyzed_at, table.id),
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

export const messagesTable = pgMessagesTable;

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

export const attachmentsTable = pgAttachmentsTable;

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

export const messageReviewsTable = pgMessageReviewsTable;

// =============================================================================
// Moderation / Corrections
// =============================================================================

/**
 * Corrected Moderations Table (PostgreSQL)
 * Stores manual corrections of AI moderation false positives
 * for few-shot injection into LLM moderation prompts.
 */
export const pgCorrectedModerationsTable = pgTable(
  "corrected_moderations",
  {
    id: pgText("id").primaryKey(),
    message_id: pgText("message_id").notNull(),
    original_flags: pgText("original_flags").notNull(),
    corrected_flags: pgText("corrected_flags").notNull(),
    correction_notes: pgText("correction_notes"),
    content_snippet: pgText("content_snippet").notNull(),
    created_at: pgBigint("created_at", { mode: "number" }).notNull(),
  },
  (table) => ({
    createdAtIdx: pgIndex("idx_corrected_moderations_created_at").on(
      table.created_at,
    ),
    messageIdIdx: pgIndex("idx_corrected_moderations_message_id").on(
      table.message_id,
    ),
  }),
);

export const correctedModerationsTable = pgCorrectedModerationsTable;

// =============================================================================
// Voice Recordings
// =============================================================================

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
    transcription: pgText("transcription"),
  },
  (table) => ({
    userIdIdx: pgIndex("idx_voice_recordings_user_id").on(table.user_id),
    channelIdIdx: pgIndex("idx_voice_recordings_channel_id").on(
      table.channel_id,
    ),
    createdIdx: pgIndex("idx_voice_recordings_created_at").on(table.created_at),
  }),
);

export const voiceRecordingsTable = pgVoiceRecordingsTable;

// =============================================================================
// AI Analysis / Analytics
// =============================================================================

/**
 * AI Analysis Runs Table (PostgreSQL)
 * Tracks AI analysis batch runs for conversation-level moderation
 */
export const pgAIAnalysisRunsTable = pgTable(
  "ai_analysis_runs",
  {
    id: pgText("id").primaryKey(),
    conversation_key: pgText("conversation_key").notNull(),
    target_message_ids: pgText("target_message_ids").notNull(),
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

export const aiAnalysisRunsTable = pgAIAnalysisRunsTable;

/**
 * User Profiles Table (PostgreSQL)
 * Stores AI-generated summaries of user behavior patterns.
 */
export const pgUserProfilesTable = pgTable(
  "user_profiles",
  {
    user_id: pgText("user_id").primaryKey(),
    guild_id: pgText("guild_id").notNull(),
    profile_summary: pgText("profile_summary").notNull(),
    last_analyzed_at: pgBigint("last_analyzed_at", {
      mode: "number",
    }).notNull(),
  },
  (table) => ({
    guildIdx: pgIndex("idx_user_profiles_guild_id").on(table.guild_id),
  }),
);

export const userProfilesTable = pgUserProfilesTable;

/**
 * User Reputations Table (PostgreSQL)
 * Tracks user trust score and infractions to provide context to AI.
 */
export const pgUserReputationsTable = pgTable(
  "user_reputations",
  {
    user_id: pgText("user_id").primaryKey(),
    guild_id: pgText("guild_id").notNull(),
    trust_score: pgInteger("trust_score").notNull().default(50),
    clean_message_streak: pgInteger("clean_message_streak")
      .notNull()
      .default(0),
    total_infractions: pgInteger("total_infractions").notNull().default(0),
    last_infraction_at: pgBigint("last_infraction_at", { mode: "number" }),
    created_at: pgBigint("created_at", { mode: "number" }).notNull(),
    updated_at: pgBigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => ({
    guildIdx: pgIndex("idx_user_reputations_guild_id").on(table.guild_id),
    scoreIdx: pgIndex("idx_user_reputations_trust_score").on(table.trust_score),
  }),
);

export const userReputationsTable = pgUserReputationsTable;

/**
 * Channel Cultures Table (PostgreSQL)
 * Stores AI-generated summaries of channel norms and slang to inject as context.
 */
export const pgChannelCulturesTable = pgTable(
  "channel_cultures",
  {
    channel_id: pgText("channel_id").primaryKey(),
    guild_id: pgText("guild_id").notNull(),
    culture_summary: pgText("culture_summary").notNull(),
    last_analyzed_at: pgBigint("last_analyzed_at", {
      mode: "number",
    }).notNull(),
  },
  (table) => ({
    guildIdx: pgIndex("idx_channel_cultures_guild_id").on(table.guild_id),
  }),
);

export const channelCulturesTable = pgChannelCulturesTable;

// =============================================================================
// Cache (text analysis + stickers)
// =============================================================================

/**
 * Text Analysis Cache Table (PostgreSQL)
 * Caches per-normalized-text moderation analysis results.
 */
export const pgTextAnalysisCacheTable = pgTable(
  "text_analysis_cache",
  {
    text: pgText("text").primaryKey(),
    flags: pgText("flags").notNull().default("[]"),
    source: pgText("source", {
      enum: ["local", "primary_ai", "vision_llm"],
    })
      .notNull()
      .default("local"),
    analyzed_at: pgBigint("analyzed_at", { mode: "number" }).notNull(),
    expires_at: pgBigint("expires_at", { mode: "number" }).notNull(),
    hit_count: pgInteger("hit_count").notNull().default(0),
  },
  (table) => ({
    expiresAtIdx: pgIndex("idx_text_analysis_cache_expires_at").on(
      table.expires_at,
    ),
    sourceIdx: pgIndex("idx_text_analysis_cache_source").on(table.source),
  }),
);

export const textAnalysisCacheTable = pgTextAnalysisCacheTable;

/**
 * Sticker Cache Table (PostgreSQL)
 * Stores uploaded sticker image URLs for vision analysis.
 */
export const pgStickerCacheTable = pgTable(
  "sticker_cache",
  {
    name: pgText("name").primaryKey(),
    imageUrl: pgText("image_url").notNull().default(""),
    mime_type: pgText("mime_type").notNull(),
    fetched_at: pgBigint("fetched_at", { mode: "number" }).notNull(),
  },
  (table) => ({
    fetchedAtIdx: pgIndex("idx_sticker_cache_fetched_at").on(table.fetched_at),
  }),
);

export const stickerCacheTable = pgStickerCacheTable;

// =============================================================================
// Meta / System
// =============================================================================

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

export const muxerJobsTable = pgMuxerJobsTable;

/**
 * UI State Table (PostgreSQL)
 * Stores persistent UI state (e.g., selected channel, filter preferences)
 */
export const pgUIStateTable = pgTable("ui_state", {
  key: pgText("key").primaryKey(),
  value: pgText("value").notNull(),
  updated_at: pgBigint("updated_at", { mode: "number" }).notNull(),
});

export const uiStateTable = pgUIStateTable;

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

export const retentionPoliciesTable = pgRetentionPoliciesTable;

/**
 * Chatbot Messages Table (PostgreSQL)
 * Stores AI chat conversation history
 */
export const pgChatbotMessagesTable = pgTable(
  "chatbot_messages",
  {
    id: pgUuid("id").defaultRandom().primaryKey(),
    user_id: pgText("user_id").notNull(),
    user_message: pgText("user_message").notNull(),
    bot_response: pgText("bot_response").notNull(),
    context: pgJsonb("context").notNull().default("{}"),
    created_at: pgTimestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userCreatedIdx: pgIndex("idx_chatbot_messages_user_created").on(
      table.user_id,
      table.created_at.desc(),
    ),
  }),
);

export const chatbotMessagesTable = pgChatbotMessagesTable;

// =============================================================================
// Type Exports
// =============================================================================

// Messages
export type Message = typeof messagesTable.$inferSelect;
export type MessageInsert = typeof messagesTable.$inferInsert;

// Attachments
export type Attachment = typeof attachmentsTable.$inferSelect;
export type AttachmentInsert = typeof attachmentsTable.$inferInsert;

// Message Reviews
export type DbMessageReview = typeof messageReviewsTable.$inferSelect;
export type DbMessageReviewInsert = typeof messageReviewsTable.$inferInsert;

// Corrected Moderations
export type CorrectedModeration = typeof correctedModerationsTable.$inferSelect;
export type CorrectedModerationInsert =
  typeof correctedModerationsTable.$inferInsert;

// Voice Recordings
export type VoiceRecording = typeof voiceRecordingsTable.$inferSelect;
export type VoiceRecordingInsert = typeof voiceRecordingsTable.$inferInsert;

// AI Analysis Runs
export type AIAnalysisRun = typeof aiAnalysisRunsTable.$inferSelect;
export type AIAnalysisRunInsert = typeof aiAnalysisRunsTable.$inferInsert;

// User Profiles
export type UserProfile = typeof userProfilesTable.$inferSelect;
export type UserProfileInsert = typeof userProfilesTable.$inferInsert;

// User Reputations
export type UserReputation = typeof userReputationsTable.$inferSelect;
export type UserReputationInsert = typeof userReputationsTable.$inferInsert;

// Channel Cultures
export type ChannelCulture = typeof channelCulturesTable.$inferSelect;
export type ChannelCultureInsert = typeof channelCulturesTable.$inferInsert;

// Text Analysis Cache
export type TextAnalysisCache = typeof textAnalysisCacheTable.$inferSelect;
export type TextAnalysisCacheInsert =
  typeof textAnalysisCacheTable.$inferInsert;

// Sticker Cache
export type StickerCacheRecord = typeof stickerCacheTable.$inferSelect;
export type StickerCacheInsert = typeof stickerCacheTable.$inferInsert;

// Muxer Jobs
export type MuxerJob = typeof muxerJobsTable.$inferSelect;
export type MuxerJobInsert = typeof muxerJobsTable.$inferInsert;

// UI State
export type UIState = typeof uiStateTable.$inferSelect;
export type UIStateInsert = typeof uiStateTable.$inferInsert;

// Retention Policies
export type DbRetentionPolicy = typeof retentionPoliciesTable.$inferSelect;
export type DbRetentionPolicyInsert =
  typeof retentionPoliciesTable.$inferInsert;

// Chatbot Messages
export type ChatbotMessage = typeof chatbotMessagesTable.$inferSelect;
export type ChatbotMessageInsert = typeof chatbotMessagesTable.$inferInsert;

// =============================================================================
// Materi (learning materials for business flow + RAG)
// =============================================================================

/**
 * Materi Documents Table (PostgreSQL)
 *
 * Stores learning materials (articles, guides, transcripts) that users
 * create or that are auto-generated (e.g. AI conversation summaries).
 * Used by the RAG chat agent to ground answers in authoritative content.
 */
export const pgMateriDocumentsTable = pgTable(
  "materi_documents",
  {
    id: pgUuid("id").primaryKey().defaultRandom(),
    title: pgText("title").notNull(),
    description: pgText("description"),
    content: pgText("content").notNull(),
    category: pgText("category").notNull().default("general"),
    tags: pgText("tags").array(),
    owner_user_id: pgText("owner_user_id").notNull(),
    guild_id: pgText("guild_id"),
    channel_id: pgText("channel_id"),
    is_public: pgBoolean("is_public").notNull().default(true),
    view_count: pgInteger("view_count").notNull().default(0),
    created_at: pgBigint("created_at", { mode: "number" }).notNull(),
    updated_at: pgBigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => ({
    categoryIdx: pgIndex("idx_materi_category").on(table.category),
    ownerIdx: pgIndex("idx_materi_owner").on(table.owner_user_id),
    guildIdx: pgIndex("idx_materi_guild").on(table.guild_id),
    searchIdx: pgIndex("idx_materi_search").on(table.title, table.category),
  }),
);

export const materiDocumentsTable = pgMateriDocumentsTable;

export type MateriDocument = typeof materiDocumentsTable.$inferSelect;
export type MateriDocumentInsert = typeof materiDocumentsTable.$inferInsert;
