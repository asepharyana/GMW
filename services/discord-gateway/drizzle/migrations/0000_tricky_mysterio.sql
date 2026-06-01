CREATE TABLE "ai_analysis_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_key" text NOT NULL,
	"target_message_ids" text NOT NULL,
	"model" text NOT NULL,
	"request_tokens_estimate" integer,
	"response_raw" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" bigint NOT NULL,
	"completed_at" bigint
);
--> statement-breakpoint
CREATE TABLE "attachments" (
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
--> statement-breakpoint
CREATE TABLE "message_reviews" (
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
--> statement-breakpoint
CREATE TABLE "messages" (
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
	"ai_analysis" text,
	"ai_categories" text,
	"ai_severity" text,
	"ai_confidence" real,
	"ai_recommended_action" text,
	"ai_analyzed_at" bigint,
	"ai_error" text
);
--> statement-breakpoint
CREATE TABLE "moderation_actions" (
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
--> statement-breakpoint
CREATE TABLE "muxer_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"data" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"maxAttempts" integer DEFAULT 3 NOT NULL,
	"createdAt" bigint NOT NULL,
	"updatedAt" bigint NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "retention_policies" (
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
--> statement-breakpoint
CREATE TABLE "text_analysis_cache" (
	"text" text PRIMARY KEY NOT NULL,
	"flags" text DEFAULT '[]' NOT NULL,
	"source" text DEFAULT 'local' NOT NULL,
	"analyzed_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL,
	"hit_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ui_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_recordings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"avatar_url" text,
	"guild_id" text,
	"channel_id" text,
	"channel_name" text,
	"filename" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"download_url" text,
	"upload_status" text DEFAULT 'pending' NOT NULL,
	"upload_error" text,
	"created_at" bigint NOT NULL,
	"uploaded_at" bigint
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "fk_attachments_message_id" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_analysis_runs_conversation_key" ON "ai_analysis_runs" USING btree ("conversation_key");--> statement-breakpoint
CREATE INDEX "idx_ai_analysis_runs_status" ON "ai_analysis_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ai_analysis_runs_created_at" ON "ai_analysis_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_attachments_channel" ON "attachments" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_attachments_message" ON "attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_attachments_status" ON "attachments" USING btree ("upload_status");--> statement-breakpoint
CREATE INDEX "idx_attachments_channel_created" ON "attachments" USING btree ("channel_id","created_at","id");--> statement-breakpoint
CREATE INDEX "idx_attachments_thread_created" ON "attachments" USING btree ("thread_id","created_at","id");--> statement-breakpoint
CREATE INDEX "idx_message_reviews_message_id" ON "message_reviews" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_message_reviews_status" ON "message_reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_message_reviews_created_at" ON "message_reviews" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_message_reviews_guild_status" ON "message_reviews" USING btree ("guild_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_messages_channel" ON "messages" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_messages_user" ON "messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_messages_created" ON "messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_messages_thread" ON "messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "idx_messages_channel_created" ON "messages" USING btree ("channel_id","created_at","id");--> statement-breakpoint
CREATE INDEX "idx_messages_thread_created" ON "messages" USING btree ("thread_id","created_at","id");--> statement-breakpoint
CREATE INDEX "idx_messages_ai_status_created" ON "messages" USING btree ("ai_status","created_at","id");--> statement-breakpoint
CREATE INDEX "idx_messages_guild_ai_status_created" ON "messages" USING btree ("guild_id","ai_status","created_at","id");--> statement-breakpoint
CREATE INDEX "idx_messages_guild_created_deleted" ON "messages" USING btree ("guild_id","created_at","deleted_at","id");--> statement-breakpoint
CREATE INDEX "idx_messages_channel_ai_status_created" ON "messages" USING btree ("channel_id","ai_status","created_at","id");--> statement-breakpoint
CREATE INDEX "idx_messages_thread_ai_status_created" ON "messages" USING btree ("thread_id","ai_status","created_at","id");--> statement-breakpoint
CREATE INDEX "idx_moderation_actions_message_id" ON "moderation_actions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_moderation_actions_user_id" ON "moderation_actions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_moderation_actions_status" ON "moderation_actions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_moderation_actions_guild_status" ON "moderation_actions" USING btree ("guild_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_muxer_jobs_status" ON "muxer_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_muxer_jobs_createdAt" ON "muxer_jobs" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "idx_retention_policies_guild_id" ON "retention_policies" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "idx_retention_policies_enabled" ON "retention_policies" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "idx_text_analysis_cache_expires_at" ON "text_analysis_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_text_analysis_cache_source" ON "text_analysis_cache" USING btree ("source");--> statement-breakpoint
CREATE INDEX "idx_voice_recordings_user_id" ON "voice_recordings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_voice_recordings_channel_id" ON "voice_recordings" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_voice_recordings_created_at" ON "voice_recordings" USING btree ("created_at");