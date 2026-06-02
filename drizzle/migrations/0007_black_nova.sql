CREATE TABLE "sticker_cache" (
	"name" text PRIMARY KEY NOT NULL,
	"base64" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"fetched_at" bigint NOT NULL
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
CREATE INDEX "idx_sticker_cache_fetched_at" ON "sticker_cache" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "idx_text_analysis_cache_expires_at" ON "text_analysis_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_text_analysis_cache_source" ON "text_analysis_cache" USING btree ("source");