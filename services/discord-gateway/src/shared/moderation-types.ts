// Shared moderation types for all services
// Source of truth — snake_case + number (matching PostgreSQL schema)

export type AIStatus =
  | "pending"
  | "processing"
  | "clean"
  | "warn"
  | "flagged"
  | "error";
export type AISeverity = "none" | "low" | "medium" | "high" | "critical";
export type AIRecommendedAction =
  | "none"
  | "monitor"
  | "warn"
  | "review"
  | "delete"
  | "escalate";

export interface BroadcasterClient {
  messageCreated: (data: unknown) => void;
  messageUpdated: (data: unknown) => void;
  messageDeleted: (data: unknown) => void;
  messageAnalyzed: (data: unknown) => void;
  attachmentCreated: (data: unknown) => void;
  attachmentUploaded: (data: unknown) => void;
  voiceRecordingStarted: (data: unknown) => void;
  voiceRecordingStopped: (data: unknown) => void;
  voiceRecordingUploaded: (data: unknown) => void;
  analysisQueueStatus: (data: unknown) => void;
}

export type ModerationBroadcaster = BroadcasterClient;

export interface RoleMetadata {
  id: string;
  name: string;
  position: number;
}

export interface UserMetadata {
  userId: string;
  username: string;
  tag: string;
  displayName: string;
  avatarUrl: string;
  bot: boolean;
  roles: RoleMetadata[];
  highestRole: RoleMetadata | null;
  joinedTimestamp: number | null;
}

export interface MessageRecord {
  id: string;
  guild_id: string;
  channel_id: string;
  thread_id: string | null;
  user_id: string;
  username: string;
  avatar_url: string | null;
  content: string;
  edited_content: string | null;
  created_at: number;
  edited_at: number | null;
  deleted_at: number | null;
  type: "text" | "edited" | "deleted";
  is_reply: boolean | null;
  is_forward: boolean | null;
  is_crosspost: boolean | null;
  reference_message_id: string | null;
  reference_channel_id: string | null;
  reference_guild_id: string | null;
  metadata: string | null;
  ai_status?: AIStatus | null;
  ai_moderation_flags?: string | null;
  ai_moderation_score?: number | null;
  ai_analysis?: string | null;
  ai_categories?: string | null;
  ai_severity?: AISeverity | null;
  ai_confidence?: number | null;
  ai_recommended_action?: AIRecommendedAction | null;
  ai_analyzed_at?: number | null;
  ai_error?: string | null;
}

export interface AttachmentRecord {
  id: string;
  message_id: string;
  guild_id: string;
  channel_id: string;
  thread_id: string | null;
  user_id: string;
  filename: string;
  size: number;
  type: string;
  discord_url: string;
  uploaded_url: string | null;
  upload_status: "pending" | "uploaded" | "failed";
  upload_error: string | null;
  created_at: number;
  uploaded_at: number | null;
}

export interface VoiceSegmentRecord {
  id: string;
  user_id: string;
  session_id: string;
  guild_id: string;
  channel_id: string;
  filename: string;
  duration_ms: number;
  created_at: number;
}

export interface DashboardMessage {
  id: string;
  channel_id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  content: string;
  created_at: number;
  type: "text" | "image" | "voice";
}

export interface MessageQuery {
  guildId?: string;
  channelId?: string;
  threadId?: string;
  status?: AIStatus[];
  userId?: string;
  q?: string;
  cursor?: string;
  limit: number;
}

export interface PageResult<T> {
  data: T[];
  nextCursor: string | null;
}

export interface AnalysisResult {
  messageId: string;
  status: Exclude<AIStatus, "pending">;
  flags: string[];
  score: number;
  analysis: string;
  categories?: string[];
  severity?: AISeverity;
  confidence?: number;
  recommendedAction?: AIRecommendedAction;
  policyVersion?: string;
  evidence?: string[];
}

export interface VoiceRecordingUploadData {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  guild_id: string | null;
  channel_id: string | null;
  channel_name: string | null;
  filename: string;
  size_bytes: number;
  download_url: string;
  upload_status: string;
  created_at: number;
  uploaded_at: number;
  transcription?: string | null;
}

export interface AnalysisQueueStatus {
  queuedConversations: number;
  activeRequests: number;
  activeIndividualRequests: number;
  individualInFlightCount: number;
  individualCircuitBreakerActive: boolean;
  lastError: string | null;
}

export type ReviewStatus = "pending" | "approved" | "rejected" | "escalated";

export interface MessageReview {
  id: string;
  message_id: string;
  guild_id: string;
  channel_id: string;
  reviewer_id: string | null;
  status: ReviewStatus;
  notes: string | null;
  created_at: number;
  reviewed_at: number | null;
}

export type ModerationActionType =
  | "delete_message"
  | "mute_user"
  | "warn_user"
  | "kick_user"
  | "ban_user"
  | "reset_nickname";

export interface ModerationAction {
  id: string;
  message_id: string | null;
  user_id: string | null;
  guild_id: string;
  action_type: ModerationActionType;
  reason: string | null;
  username: string | null;
  executed_by: string | null;
  status: "pending" | "executed" | "failed";
  error: string | null;
  created_at: number;
  executed_at: number | null;
}

export interface RetentionPolicy {
  id: string;
  guild_id: string;
  channel_id: string | null;
  retention_days: number;
  apply_to_media: boolean;
  apply_to_voice: boolean;
  enabled: boolean;
  created_at: number;
  updated_at: number;
}
