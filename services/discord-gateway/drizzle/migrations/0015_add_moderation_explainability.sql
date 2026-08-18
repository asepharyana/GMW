-- Migration: 0015_add_moderation_explainability.sql
-- Date: 2026-08-18
-- Description: Add structured explainability columns to moderation_actions.
-- These are READ (surfaced read-only to the public web) so they are never
-- "written but never read" — they back the public moderation transparency view.
-- Idempotent: no-ops on databases that already carry the columns.

ALTER TABLE IF EXISTS "moderation_actions"
  ADD COLUMN IF NOT EXISTS "flags" text,
  ADD COLUMN IF NOT EXISTS "categories" text,
  ADD COLUMN IF NOT EXISTS "severity" text
    CHECK ("severity" IS NULL OR "severity" IN ('none','low','medium','high','critical')),
  ADD COLUMN IF NOT EXISTS "confidence" real,
  ADD COLUMN IF NOT EXISTS "score" real,
  ADD COLUMN IF NOT EXISTS "evidence" text,
  ADD COLUMN IF NOT EXISTS "policy_version" text;
