-- Rename server_name (guild name) -> server_nick (member's server nickname)
-- server_name was added in 0018 but never populated (all NULL), so renaming
-- the empty column is safe and keeps retention semantics correct.
-- Idempotent across all possible prior states:
--   • server_name present, server_nick absent  -> rename
--   • both present (backfill created server_nick) -> drop the stale server_name
--   • server_nick present only                -> already done, no-op
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'moderation_actions' AND column_name = 'server_name'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'moderation_actions' AND column_name = 'server_nick'
  ) THEN
    ALTER TABLE "moderation_actions" RENAME COLUMN "server_name" TO "server_nick";
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'moderation_actions' AND column_name = 'server_name'
  ) THEN
    -- server_nick already exists (e.g. backfilled out-of-band) — drop the
    -- now-redundant server_name column instead of renaming into a conflict.
    ALTER TABLE "moderation_actions" DROP COLUMN "server_name";
  END IF;
END $$;
