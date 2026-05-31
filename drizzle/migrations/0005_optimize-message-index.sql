CREATE INDEX IF NOT EXISTS "idx_messages_guild_created_deleted" ON "messages" USING btree ("guild_id","created_at","deleted_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_channel_ai_status_created" ON "messages" USING btree ("channel_id","ai_status","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_thread_ai_status_created" ON "messages" USING btree ("thread_id","ai_status","created_at","id");
