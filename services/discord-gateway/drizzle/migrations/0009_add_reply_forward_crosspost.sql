ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS is_reply boolean,
  ADD COLUMN IF NOT EXISTS is_forward boolean,
  ADD COLUMN IF NOT EXISTS is_crosspost boolean,
  ADD COLUMN IF NOT EXISTS reference_message_id text,
  ADD COLUMN IF NOT EXISTS reference_channel_id text,
  ADD COLUMN IF NOT EXISTS reference_guild_id text;
