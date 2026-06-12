-- Replace base64 blob storage with uploaded image URL
-- Old base64 data is dropped; cache will refill on next occurrence via upload+URL.
DO $$ BEGIN
	ALTER TABLE "sticker_cache" ADD COLUMN "image_url" text NOT NULL DEFAULT '';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "sticker_cache" DROP COLUMN IF EXISTS "base64";
--> statement-breakpoint
ALTER TABLE "sticker_cache" DROP COLUMN IF EXISTS "size";