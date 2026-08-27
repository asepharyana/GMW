ALTER TABLE "moderation_actions" ADD COLUMN IF NOT EXISTS "username" text;
--> statement-breakpoint
-- Backfill username from messages table for existing actions
UPDATE "moderation_actions" a
  SET "username" = m."username"
  FROM "messages" m
  WHERE a."message_id" = m."id"
    AND a."username" IS NULL
    AND m."username" IS NOT NULL;
