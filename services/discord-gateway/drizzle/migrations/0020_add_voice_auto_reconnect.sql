-- Voice auto-reconnect: persist desired voice state per guild.
-- The gateway rejoins the same channel after restart/reboot and after an
-- unexpected voice drop (kick / server move / voice server restart).
-- Idempotent: skips if the table already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'voice_auto_reconnect'
  ) THEN
    CREATE TABLE "voice_auto_reconnect" (
      "guild_id" text PRIMARY KEY NOT NULL,
      "channel_id" text NOT NULL,
      "channel_name" text,
      "connected_at" bigint NOT NULL,
      "updated_at" bigint NOT NULL
    );
  END IF;
END $$;