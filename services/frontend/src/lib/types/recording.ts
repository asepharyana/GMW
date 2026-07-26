export interface VoiceRecording {
  id: string;
  user_id: string;
  username: string;
  avatar_url?: string | null;
  guild_id?: string | null;
  channel_id?: string | null;
  channel_name?: string | null;
  filename: string;
  size_bytes: number;
  download_url?: string | null;
  upload_status: string;
  upload_error?: string | null;
  transcription?: string | null;
  created_at: number;
  uploaded_at?: number | null;
}

export interface PaginatedRecordings {
  items: VoiceRecording[];
  nextCursor: string | null;
  hasMore: boolean;
}
