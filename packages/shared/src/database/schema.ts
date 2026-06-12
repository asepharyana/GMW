import {
  bigint as pgBigint,
  foreignKey as pgForeignKey,
  index as pgIndex,
  integer as pgInteger,
  real as pgReal,
  pgTable,
  text as pgText,
} from "drizzle-orm/pg-core";

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
    messageIdx: pgIndex("idx_corrected_moderations_message_id").on(
      table.message_id,
    ),
  }),
);

export type CorrectedModeration =
  typeof pgCorrectedModerationsTable.$inferSelect;
export type CorrectedModerationInsert =
  typeof pgCorrectedModerationsTable.$inferInsert;

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
