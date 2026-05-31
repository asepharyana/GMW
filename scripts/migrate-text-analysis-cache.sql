-- Create text_analysis_cache table for DB-backed moderation analysis caching.
-- Full-text key preserves context so "kau" (clean) ≠ "awas kau" (harassment).

CREATE TABLE IF NOT EXISTS text_analysis_cache (
  text        TEXT PRIMARY KEY,
  flags       TEXT NOT NULL DEFAULT '[]',
  source      TEXT NOT NULL DEFAULT 'local'
              CHECK (source IN ('local', 'nvidia', 'primary_ai', 'groq', 'vision_llm')),
  analyzed_at BIGINT NOT NULL,
  expires_at  BIGINT NOT NULL,
  hit_count   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_text_analysis_cache_expires_at
  ON text_analysis_cache (expires_at);

CREATE INDEX IF NOT EXISTS idx_text_analysis_cache_source
  ON text_analysis_cache (source);

-- Periodic cleanup: run every hour to remove expired entries.
-- This is optional; prune_expired_texts() in textCacheStore.ts also works.
-- COMMENT: Consider using pg_cron or an external scheduler for:
--   DELETE FROM text_analysis_cache WHERE expires_at < extract(epoch from now()) * 1000;
