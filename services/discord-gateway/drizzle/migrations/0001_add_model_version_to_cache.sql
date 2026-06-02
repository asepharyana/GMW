-- Add model_version column to text_analysis_cache table
ALTER TABLE "text_analysis_cache" ADD COLUMN "model_version" text DEFAULT 'v1' NOT NULL;

-- Create indexes for model_version and composite source+model_version
CREATE INDEX "idx_text_analysis_cache_model_version" ON "text_analysis_cache" USING btree ("model_version");
CREATE INDEX "idx_text_analysis_cache_source_model_version" ON "text_analysis_cache" USING btree ("source","model_version");
