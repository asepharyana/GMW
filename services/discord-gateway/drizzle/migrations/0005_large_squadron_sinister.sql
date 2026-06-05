CREATE TABLE "channel_cultures" (
	"channel_id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"culture_summary" text NOT NULL,
	"last_analyzed_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_reputations" (
	"user_id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"trust_score" integer DEFAULT 50 NOT NULL,
	"clean_message_streak" integer DEFAULT 0 NOT NULL,
	"total_infractions" integer DEFAULT 0 NOT NULL,
	"last_infraction_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_channel_cultures_guild_id" ON "channel_cultures" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "idx_user_reputations_guild_id" ON "user_reputations" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "idx_user_reputations_trust_score" ON "user_reputations" USING btree ("trust_score");