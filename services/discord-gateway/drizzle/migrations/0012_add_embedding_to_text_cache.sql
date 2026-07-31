ALTER TABLE text_analysis_cache
  ADD COLUMN IF NOT EXISTS embedding text;
