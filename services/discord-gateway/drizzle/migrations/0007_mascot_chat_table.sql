-- Move mascot_chat_messages from runtime CREATE TABLE to Drizzle migration
-- Previously created at runtime by mascot-chat.repository.ts ensureSchema()
CREATE TABLE IF NOT EXISTS "mascot_chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"user_message" text NOT NULL,
	"mascot_response" text NOT NULL,
	"context" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_mascot_chat_messages_user_created" ON "mascot_chat_messages" USING btree ("user_id", "created_at" DESC);
