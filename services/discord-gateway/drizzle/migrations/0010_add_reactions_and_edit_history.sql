-- Migration 0010: Add message_reactions and message_edits tables
-- Generated from schema: pgReactionsTable, pgMessageEditsTable

CREATE TABLE IF NOT EXISTS "message_reactions" (
  "id" text PRIMARY KEY,
  "message_id" text NOT NULL,
  "channel_id" text NOT NULL,
  "guild_id" text NOT NULL,
  "user_id" text NOT NULL,
  "username" text NOT NULL,
  "emoji" text NOT NULL,
  "emoji_id" text,
  "animated" boolean NOT NULL DEFAULT false,
  "reaction_type" text NOT NULL CHECK ("reaction_type" IN ('add', 'remove')),
  "created_at" bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_reactions_message_id" ON "message_reactions" ("message_id");
CREATE INDEX IF NOT EXISTS "idx_reactions_user_id" ON "message_reactions" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_reactions_guild_created" ON "message_reactions" ("guild_id", "created_at");

CREATE TABLE IF NOT EXISTS "message_edits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "message_id" text NOT NULL,
  "old_content" text NOT NULL,
  "edited_at" bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_message_edits_message_id" ON "message_edits" ("message_id");
CREATE INDEX IF NOT EXISTS "idx_message_edits_edited_at" ON "message_edits" ("edited_at");
