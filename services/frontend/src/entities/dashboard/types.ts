export interface DashboardStats {
  total_messages: number;
  total_users: number;
  total_flagged: number;
  total_clean: number;
  total_warned: number;
  total_error: number;
  total_voice_recordings: number;
  total_profiles: number;
  today_messages: number;
  today_flagged: number;
  active_users_24h: number;
  top_channels: Array<{
    channel_id: string;
    channel_name: string | null;
    message_count: number;
  }>;
  moderation_overview: {
    pending: number;
    processing: number;
    error: number;
  };
}

export interface DashboardUser {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  profile_summary: string | null;
  total_messages: number;
  flagged_count: number;
  last_message_at: number | null;
  trust_score: number | null;
}

export interface DashboardUserDetail extends DashboardUser {
  last_analyzed_at: number | null;
  clean_message_streak: number | null;
  total_infractions: number | null;
  clean_count: number;
  recent_messages: Array<{
    id: string;
    content: string;
    channel_id: string;
    created_at: number;
    ai_status: string | null;
  }>;
}

export interface DashboardChannel {
  channel_id: string;
  channel_name: string | null;
  guild_id: string | null;
  total_messages: number;
  flagged_count: number;
  last_message_at: number | null;
  culture_summary: string | null;
  last_analyzed_at: number | null;
}

export interface DashboardChannelDetail extends DashboardChannel {
  clean_count: number;
  recent_messages: Array<{
    id: string;
    content: string;
    channel_id: string;
    created_at: number;
    ai_status: string | null;
    username: string | null;
  }>;
}

export interface ChatResponse {
  response?: string;
}
