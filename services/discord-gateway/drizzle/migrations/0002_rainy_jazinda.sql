CREATE TABLE "sticker_cache" (
	"name" text PRIMARY KEY NOT NULL,
	"base64" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"fetched_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_sticker_cache_fetched_at" ON "sticker_cache" USING btree ("fetched_at");