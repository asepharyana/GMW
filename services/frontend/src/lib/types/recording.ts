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
  created_at: number;
  uploaded_at?: number | null;
  transcription?: string | null;
}

/** True when the recording file is video (camera/screen-share MP4). */
export function isVideoRecording(r: Pick<VoiceRecording, "filename">): boolean {
  return /\.(mp4|webm|mov|h264)$/i.test(r.filename);
}

export interface PaginatedRecordings {
  items: VoiceRecording[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** recordings.summary — per-speaker leaderboard. */
export interface SpeakerSummary {
  user_id: string;
  username: string;
  avatar_url: string | null;
  clips: number;
  est_duration_s: number;
  words: number;
  transcribed: number;
  last_at: number;
}
