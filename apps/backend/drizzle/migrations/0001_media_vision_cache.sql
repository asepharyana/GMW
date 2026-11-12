CREATE TABLE IF NOT EXISTS public.media_vision_cache (
    fingerprint text NOT NULL,
    description text NOT NULL,
    resolved_at bigint NOT NULL,
    hit_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT media_vision_cache_pkey PRIMARY KEY (fingerprint)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_media_vision_cache_resolved_at ON public.media_vision_cache USING btree (resolved_at);
