-- Migration: add ai_analysis_duration_ms to messages
-- Tracks how long the AI moderation LLM call took, per message (ms).
-- Idempotent: safe to re-run.
--
-- Run against the production GMW database, e.g.:
--   PGPASSWORD=*** psql -h 100.121.180.82 -p 6432 -U asephs -d dcbot \
--     -f scripts/add-ai-analysis-duration.sql

ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "ai_analysis_duration_ms" BIGINT;
