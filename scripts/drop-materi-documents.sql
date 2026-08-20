-- Migration: Drop materi_documents table (feature removed)
-- Run: PGPASSWORD=<pw> psql -h <host> -U <user> -d <db> -f scripts/drop-materi-documents.sql
-- Reverses scripts/add-materi-documents.sql which was deleted with the feature.

BEGIN;

DROP INDEX IF EXISTS idx_materi_search;
DROP INDEX IF EXISTS idx_materi_guild;
DROP INDEX IF EXISTS idx_materi_owner;
DROP INDEX IF EXISTS idx_materi_category;

DROP TABLE IF EXISTS public.materi_documents;

COMMIT;
