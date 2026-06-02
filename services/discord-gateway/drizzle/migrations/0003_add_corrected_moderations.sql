CREATE TABLE "corrected_moderations" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"original_flags" text NOT NULL,
	"corrected_flags" text NOT NULL,
	"correction_notes" text,
	"content_snippet" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_corrected_moderations_created_at" ON "corrected_moderations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_corrected_moderations_message_id" ON "corrected_moderations" USING btree ("message_id");