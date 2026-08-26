export interface ChannelCultureRow {
  channel_id: string;
  guild_id: string | null;
  channel_name: string | null;
  culture_summary: string | null;
  last_analyzed_at: number | null;
}

export interface GlossaryRow {
  term: string;
  definition: string;
  source_url: string;
  resolved_at: number;
  hit_count: number;
}

export interface EditHistoryRow {
  id: string;
  message_id: string;
  old_content: string;
  new_content: string;
  edited_at: number;
  channel_id: string | null;
  channel_name: string | null;
  username: string | null;
}
