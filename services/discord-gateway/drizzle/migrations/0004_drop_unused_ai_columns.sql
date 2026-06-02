-- Migration: 0004_drop_unused_ai_columns
-- Converts orphaned raw SQL from src/shared/database/migrations/001_drop_unused_ai_columns.sql
-- These column definitions were removed from the Drizzle schema but old databases
-- created before the refactor still have them. Drizzle never ran the raw SQL.
ALTER TABLE messages DROP COLUMN IF EXISTS ai_moderation_raw;
ALTER TABLE messages DROP COLUMN IF EXISTS ai_policy_version;
ALTER TABLE messages DROP COLUMN IF EXISTS ai_evidence;
