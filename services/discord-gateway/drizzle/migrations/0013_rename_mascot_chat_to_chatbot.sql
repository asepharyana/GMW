-- Rename mascot chat tables/columns to chatbot (code rename in 977a6f9,
-- DB was never migrated). Idempotent: no-ops on databases that already
-- carry the new names (e.g. after a manual hotfix).
ALTER TABLE IF EXISTS "mascot_chat_messages" RENAME TO "chatbot_messages";

--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'chatbot_messages' AND column_name = 'mascot_response'
  ) THEN
    ALTER TABLE "chatbot_messages" RENAME COLUMN "mascot_response" TO "bot_response";
  END IF;
END $$;

--> statement-breakpoint
ALTER INDEX IF EXISTS "idx_mascot_chat_messages_user_created" RENAME TO "idx_chatbot_messages_user_created";
