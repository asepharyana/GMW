-- 0002_add_sticker_cache.sql
-- Creates the sticker_cache table (defined in schema.ts but missing from migrations)

CREATE TABLE IF NOT EXISTS "sticker_cache" (
    "name" text PRIMARY KEY NOT NULL,
    "base64" text NOT NULL,
    "mime_type" text NOT NULL,
    "size" integer NOT NULL,
    "fetched_at" bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_sticker_cache_fetched_at" ON "sticker_cache" ("fetched_at");
