-- Migration: Add materi_documents table for learning materials + RAG
-- Run: PGPASSWORD=<pw> psql -h <host> -U <user> -d <db> -f scripts/add-materi-documents.sql
-- Schema mirrors services/backend/src/shared/database/schema.ts (pgMateriDocumentsTable).

BEGIN;

CREATE TABLE IF NOT EXISTS public.materi_documents (
    id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    title         text          NOT NULL,
    description   text,
    content       text          NOT NULL,
    category      text          NOT NULL DEFAULT 'general',
    tags          jsonb         NOT NULL DEFAULT '[]',
    owner_user_id text          NOT NULL DEFAULT 'anonymous',
    guild_id      text,
    channel_id    text,
    is_public     boolean       NOT NULL DEFAULT true,
    view_count    integer       NOT NULL DEFAULT 0,
    created_at    bigint        NOT NULL DEFAULT (EXTRACT(epoch FROM now())::bigint * 1000),
    updated_at    bigint        NOT NULL DEFAULT (EXTRACT(epoch FROM now())::bigint * 1000)
);

-- Indexes mirror the Drizzle index definitions (idx_materi_category, idx_materi_owner, idx_materi_guild, idx_materi_search).
CREATE INDEX IF NOT EXISTS idx_materi_category ON public.materi_documents (category);
CREATE INDEX IF NOT EXISTS idx_materi_owner    ON public.materi_documents (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_materi_guild    ON public.materi_documents (guild_id);
CREATE INDEX IF NOT EXISTS idx_materi_search   ON public.materi_documents (title, category);

COMMIT;
