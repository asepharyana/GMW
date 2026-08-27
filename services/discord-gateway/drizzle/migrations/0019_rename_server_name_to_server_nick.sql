-- Rename server_name (guild name) -> server_nick (member's server nickname)
-- server_name was added in 0018 but never populated (all NULL), so renaming
-- the empty column is safe and keeps retention semantics correct.
ALTER TABLE "moderation_actions" RENAME COLUMN "server_name" TO "server_nick";
