import {
  bigint as pgBigint,
  boolean as pgBoolean,
  index as pgIndex,
  pgTable,
  text as pgText,
  uuid as pgUuid,
} from "drizzle-orm/pg-core";
import {
  pgAttachmentsTable,
  pgMessageReviewsTable,
  pgMessagesTable,
} from "../../../shared/index.js";

// Re-export shared message/attachment/review tables
export { pgAttachmentsTable, pgMessageReviewsTable, pgMessagesTable };
export const messagesTable = pgMessagesTable;
export const attachmentsTable = pgAttachmentsTable;
export const messageReviewsTable = pgMessageReviewsTable;

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

export const moderationActionsTable = pgModerationActionsTable;

/**
 * Message Edits Table (PostgreSQL)
 */
export const pgMessageEditsTable = pgTable(
  "message_edits",
  {
    id: pgUuid("id").defaultRandom().primaryKey(),
    message_id: pgText("message_id").notNull(),
    old_content: pgText("old_content").notNull(),
    edited_at: pgBigint("edited_at", { mode: "number" }).notNull(),
  },
  (table) => ({
    messageIdIdx: pgIndex("idx_message_edits_message_id").on(table.message_id),
    editedAtIdx: pgIndex("idx_message_edits_edited_at").on(table.edited_at),
  }),
);

export const messageEditsTable = pgMessageEditsTable;

/**
 * Reactions Table (PostgreSQL)
 */
export const pgReactionsTable = pgTable(
  "message_reactions",
  {
    id: pgText("id").primaryKey(),
    message_id: pgText("message_id").notNull(),
    channel_id: pgText("channel_id").notNull(),
    guild_id: pgText("guild_id").notNull(),
    user_id: pgText("user_id").notNull(),
    username: pgText("username").notNull(),
    emoji: pgText("emoji").notNull(),
    emoji_id: pgText("emoji_id"),
    animated: pgBoolean("animated").notNull().default(false),
    reaction_type: pgText("reaction_type", {
      enum: ["add", "remove"],
    }).notNull(),
    created_at: pgBigint("created_at", { mode: "number" }).notNull(),
  },
  (table) => ({
    messageIdIdx: pgIndex("idx_reactions_message_id").on(table.message_id),
    userIdIdx: pgIndex("idx_reactions_user_id").on(table.user_id),
    guildCreatedIdx: pgIndex("idx_reactions_guild_created").on(
      table.guild_id,
      table.created_at,
    ),
  }),
);

export const reactionsTable = pgReactionsTable;

// Types
export type Message = typeof messagesTable.$inferSelect;
export type MessageInsert = typeof messagesTable.$inferInsert;
export type Attachment = typeof attachmentsTable.$inferSelect;
export type AttachmentInsert = typeof attachmentsTable.$inferInsert;
export type MessageReview = typeof messageReviewsTable.$inferSelect;
export type MessageReviewInsert = typeof messageReviewsTable.$inferInsert;
export type ModerationAction = typeof moderationActionsTable.$inferSelect;
export type ModerationActionInsert = typeof moderationActionsTable.$inferInsert;
