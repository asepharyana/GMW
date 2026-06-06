-- Replace base64 blob storage with uploaded image URL
-- Old base64 data is dropped; cache will refill on next occurrence via upload+URL.
ALTER TABLE "sticker_cache" ADD COLUMN "image_url" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "sticker_cache" DROP COLUMN "base64";
--> statement-breakpoint
ALTER TABLE "sticker_cache" DROP COLUMN "size";
