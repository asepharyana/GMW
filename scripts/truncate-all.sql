-- Truncate all tables in correct order (respecting FK dependencies)
-- attachments FK → messages (CASCADE), others are independent
-- Use CASCADE to handle any remaining FK chains automatically

TRUNCATE TABLE
  messages,
  attachments,
  ui_state,
  ai_analysis_runs,
  voice_recordings,
  user_reputations,
  channel_cultures,
  message_reviews,
  moderation_actions,
  retention_policies,
  text_analysis_cache,
  sticker_cache,
  corrected_moderations,
  user_profiles,
  mascot_chat_messages,
  muxer_jobs
CASCADE;
