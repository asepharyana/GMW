CREATE TABLE IF NOT EXISTS "user_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"profile_summary" text NOT NULL,
	"last_analyzed_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_profiles_guild_id" ON "user_profiles" USING btree ("guild_id");
