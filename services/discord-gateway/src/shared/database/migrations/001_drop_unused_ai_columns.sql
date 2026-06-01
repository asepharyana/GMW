-- Migration: 001_drop_unused_ai_columns.sql
-- Date: 2026-05-30
-- Description: Drop columns that are written but never read from messages table
--   - ai_moderation_raw: raw LLM response, never consumed
--   - ai_policy_version: hardcoded string, never used for decisions
--   - ai_evidence: JSON evidence array, never read after write

ALTER TABLE messages DROP COLUMN IF EXISTS ai_moderation_raw;
ALTER TABLE messages DROP COLUMN IF EXISTS ai_policy_version;
ALTER TABLE messages DROP COLUMN IF EXISTS ai_evidence;
