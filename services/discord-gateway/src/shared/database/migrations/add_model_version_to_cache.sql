-- Migration: Add model_version column to text_analysis_cache table
-- Purpose: Track which vision/LLM model version produced each cache entry
-- Reason: Invalidate old cache entries when model prompts change (e.g., terminal screenshot false positive fix)
-- Date: 2026-06-02

BEGIN;

-- Add model_version column with default value
ALTER TABLE text_analysis_cache
ADD COLUMN model_version VARCHAR(50) NOT NULL DEFAULT 'v1';

-- Create index for efficient filtering by model version
CREATE INDEX idx_text_analysis_cache_model_version
ON text_analysis_cache(model_version);

-- Create composite index for source + model_version queries (common pattern)
CREATE INDEX idx_text_analysis_cache_source_model_version
ON text_analysis_cache(source, model_version);

-- Optional: Clean up old vision_llm entries that may have stale/incorrect analysis
-- Uncomment to remove all old vision analysis cache on deployment:
-- DELETE FROM text_analysis_cache WHERE source = 'vision_llm' AND model_version = 'v1';

COMMIT;
