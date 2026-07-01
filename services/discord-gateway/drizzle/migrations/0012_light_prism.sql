CREATE INDEX IF NOT EXISTS "idx_messages_guild_ai_status_analyzed" ON "messages" USING btree ("guild_id","ai_status","ai_analyzed_at","id");--> statement-breakpoint
