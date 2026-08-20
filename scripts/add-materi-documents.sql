-- Migration: Add materi_documents table for learning materials + RAG
-- Run: PGPASSWORD=<pw> psql -h <host> -U <user> -d <db> -f scripts/add-materi-documents.sql

BEGIN;

CREATE TABLE IF NOT EXISTS "materi_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" text NOT NULL,
  "description" text,
  "content" text NOT NULL,
  "category" text NOT NULL DEFAULT 'general',
  "tags" jsonb NOT NULL DEFAULT '[]',
  "owner_user_id" text NOT NULL DEFAULT 'anonymous',
  "guild_id" text,
  "channel_id" text,
  "is_public" boolean NOT NULL DEFAULT true,
  "view_count" integer NOT NULL DEFAULT 0,
  "created_at" bigint NOT NULL DEFAULT extract(epoch from now())::bigint,
  "updated_at" bigint NOT NULL DEFAULT extract(epoch from now())::bigint
);

CREATE INDEX IF NOT EXISTS "idx_materi_category" ON "materi_documents" ("category");
CREATE INDEX IF NOT EXISTS "idx_materi_is_public" ON "materi_documents" ("is_public");
CREATE INDEX IF NOT EXISTS "idx_materi_owner" ON "materi_documents" ("owner_user_id");
CREATE INDEX IF NOT EXISTS "idx_materi_created" ON "materi_documents" ("created_at");

COMMIT;
