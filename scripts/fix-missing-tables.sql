-- Fix: missing messages and attachments tables on VPS
-- Run: PGPASSWORD=hunterz psql -h 100.108.1.124 -U asephs -d hub -f scripts/fix-missing-tables.sql

BEGIN;

-- 1. Create messages table if not exists
CREATE TABLE IF NOT EXISTS "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"thread_id" text,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"avatar_url" text,
	"content" text NOT NULL,
	"edited_content" text,
	"created_at" bigint NOT NULL,
	"edited_at" bigint,
	"deleted_at" bigint,
	"type" text DEFAULT 'text' NOT NULL,
	"metadata" text,
	"ai_status" text DEFAULT 'pending' NOT NULL,
	"ai_moderation_flags" text,
	"ai_moderation_score" real,
	"ai_moderation_raw" text,
	"ai_analysis" text,
	"ai_analyzed_at" bigint,
	"ai_error" text
);

-- 2. Create attachments table if not exists
CREATE TABLE IF NOT EXISTS "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"thread_id" text,
	"user_id" text NOT NULL,
	"filename" text NOT NULL,
	"size" integer NOT NULL,
	"type" text NOT NULL,
	"discord_url" text NOT NULL,
	"uploaded_url" text,
	"upload_status" text DEFAULT 'pending' NOT NULL,
	"upload_error" text,
	"created_at" bigint NOT NULL,
	"uploaded_at" bigint
);

-- 3. Foreign key
ALTER TABLE "attachments" DROP CONSTRAINT IF EXISTS "fk_attachments_message_id";
ALTER TABLE "attachments" ADD CONSTRAINT "fk_attachments_message_id"
  FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id")
  ON DELETE cascade ON UPDATE no action;

-- 4. Indexes from migration 0000
CREATE INDEX IF NOT EXISTS "idx_attachments_channel" ON "attachments" USING btree ("channel_id");
CREATE INDEX IF NOT EXISTS "idx_attachments_message" ON "attachments" USING btree ("message_id");
CREATE INDEX IF NOT EXISTS "idx_attachments_status" ON "attachments" USING btree ("upload_status");
CREATE INDEX IF NOT EXISTS "idx_messages_channel" ON "messages" USING btree ("channel_id");
CREATE INDEX IF NOT EXISTS "idx_messages_user" ON "messages" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "idx_messages_created" ON "messages" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "idx_messages_thread" ON "messages" USING btree ("thread_id");

-- 5. Indexes from migration 0001
CREATE INDEX IF NOT EXISTS "idx_attachments_channel_created" ON "attachments" ("channel_id","created_at","id");
CREATE INDEX IF NOT EXISTS "idx_attachments_thread_created" ON "attachments" ("thread_id","created_at","id");
CREATE INDEX IF NOT EXISTS "idx_messages_channel_created" ON "messages" ("channel_id","created_at","id");
CREATE INDEX IF NOT EXISTS "idx_messages_thread_created" ON "messages" ("thread_id","created_at","id");
CREATE INDEX IF NOT EXISTS "idx_messages_ai_status_created" ON "messages" ("ai_status","created_at","id");
CREATE INDEX IF NOT EXISTS "idx_messages_guild_ai_status_created" ON "messages" ("guild_id","ai_status","created_at","id");

-- 6. Columns from migration 0003
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "ai_categories" text;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "ai_severity" text;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "ai_confidence" real;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "ai_recommended_action" text;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "ai_policy_version" text;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "ai_evidence" text;

-- 7. message_reviews, moderation_actions, retention_policies (from 0003 — should already exist, but IF NOT EXISTS safe)
CREATE TABLE IF NOT EXISTS "message_reviews" (
  "id" text PRIMARY KEY NOT NULL,
  "message_id" text NOT NULL,
  "guild_id" text NOT NULL,
  "channel_id" text NOT NULL,
  "reviewer_id" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "notes" text,
  "created_at" bigint NOT NULL,
  "reviewed_at" bigint
);
CREATE INDEX IF NOT EXISTS "idx_message_reviews_message_id" ON "message_reviews" USING btree ("message_id");
CREATE INDEX IF NOT EXISTS "idx_message_reviews_guild_status" ON "message_reviews" USING btree ("guild_id", "status", "created_at");

CREATE TABLE IF NOT EXISTS "moderation_actions" (
  "id" text PRIMARY KEY NOT NULL,
  "message_id" text,
  "user_id" text,
  "guild_id" text NOT NULL,
  "action_type" text NOT NULL,
  "reason" text,
  "executed_by" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "error" text,
  "created_at" bigint NOT NULL,
  "executed_at" bigint
);
CREATE INDEX IF NOT EXISTS "idx_moderation_actions_message_id" ON "moderation_actions" USING btree ("message_id");
CREATE INDEX IF NOT EXISTS "idx_moderation_actions_user_id" ON "moderation_actions" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "idx_moderation_actions_status" ON "moderation_actions" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_moderation_actions_guild_status" ON "moderation_actions" USING btree ("guild_id", "status", "created_at");

CREATE TABLE IF NOT EXISTS "retention_policies" (
  "id" text PRIMARY KEY NOT NULL,
  "guild_id" text NOT NULL,
  "channel_id" text,
  "retention_days" integer DEFAULT 90 NOT NULL,
  "apply_to_media" boolean DEFAULT true NOT NULL,
  "apply_to_voice" boolean DEFAULT true NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" bigint NOT NULL,
  "updated_at" bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_retention_policies_guild_id" ON "retention_policies" USING btree ("guild_id");
CREATE INDEX IF NOT EXISTS "idx_retention_policies_enabled" ON "retention_policies" USING btree ("enabled");

-- 8. Indexes from migration 0005
CREATE INDEX IF NOT EXISTS "idx_messages_guild_created_deleted" ON "messages" USING btree ("guild_id","created_at","deleted_at","id");
CREATE INDEX IF NOT EXISTS "idx_messages_channel_ai_status_created" ON "messages" USING btree ("channel_id","ai_status","created_at","id");
CREATE INDEX IF NOT EXISTS "idx_messages_thread_ai_status_created" ON "messages" USING btree ("thread_id","ai_status","created_at","id");

-- 9. Drizzle migration tracking table (so future drizzle-kit migrate works)
CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
  "id" serial PRIMARY KEY,
  "hash" text NOT NULL,
  "created_at" bigint NOT NULL
);

-- Seed migration tracking so drizzle-kit doesn't try to re-apply
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "__drizzle_migrations" WHERE hash = '0000_rare_kitty_pryde') THEN
    INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES
      ('0000_rare_kitty_pryde', 1778750697764),
      ('0001_curious_zodiak', 1778764447718),
      ('0002_dark_omega_flight', 1779109619461),
      ('0003_ai_moderation_review_guardrails', 1780079000000),
      ('0005_optimize-message-index', 1780218363790);
  END IF;
END $$;

COMMIT;
