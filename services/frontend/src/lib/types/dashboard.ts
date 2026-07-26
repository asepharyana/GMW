import type { MessageRecord } from "./message";

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
  top_channels: TopChannel[];
  moderation_overview: ModerationOverview;
}

export interface TopChannel {
  channel_id: string;
  channel_name?: string | null;
  message_count: number;
}

export interface ModerationOverview {
  pending: number;
  processing: number;
  error: number;
}

export interface DashboardUser {
  user_id: string;
  username?: string | null;
  avatar_url?: string | null;
  profile_summary?: string | null;
  total_messages: number;
  flagged_count: number;
  last_message_at?: number | null;
  trust_score?: number | null;
  clean_message_streak?: number;
}

export interface DashboardUserDetail extends DashboardUser {
  last_analyzed_at?: number | null;
  clean_message_streak: number;
  total_infractions: number;
  clean_count: number;
  recent_messages: MessageRecord[];
}

export interface DashboardChannel {
  channel_id: string;
  channel_name?: string | null;
  guild_id?: string | null;
  total_messages: number;
  flagged_count: number;
  last_message_at?: number | null;
  culture_summary?: string | null;
  last_analyzed_at?: number | null;
}

export interface DashboardChannelDetail {
  channel_id: string;
  channel_name?: string | null;
  guild_id?: string | null;
  total_messages: number;
  flagged_count: number;
  last_message_at?: number | null;
  culture_summary?: string | null;
  last_analyzed_at?: number | null;
  clean_count: number;
  recent_messages: MessageRecord[];
}

export interface PaginatedUsers {
  data: DashboardUser[];
  nextCursor: string | null;
}

export interface PaginatedChannels {
  data: DashboardChannel[];
  nextCursor: string | null;
}
