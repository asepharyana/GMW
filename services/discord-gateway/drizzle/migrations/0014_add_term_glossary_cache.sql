CREATE TABLE IF NOT EXISTS "term_glossary_cache" (
	"term" text PRIMARY KEY NOT NULL,
	"definition" text NOT NULL,
	"source_url" text DEFAULT '' NOT NULL,
	"resolved_at" bigint NOT NULL,
	"hit_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_term_glossary_cache_resolved_at" ON "term_glossary_cache" USING btree ("resolved_at");
