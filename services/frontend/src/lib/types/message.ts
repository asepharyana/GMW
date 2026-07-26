// ── AI Moderation Types ──────────────────────────────────────

export type AiStatus =
  | "pending"
  | "processing"
  | "clean"
  | "warn"
  | "flagged"
  | "error";

export type AiSeverity = "none" | "low" | "medium" | "high" | "critical";

export type AiRecommendedAction =
  | "none"
  | "monitor"
  | "warn"
  | "review"
  | "delete"
  | "escalate";

// ── Embeds & Metadata ────────────────────────────────────────

export interface EmbedMedia {
  url: string;
  width?: number | null;
  height?: number | null;
}

export interface EmbedInfo {
  title?: string | null;
  description?: string | null;
  url?: string | null;
  color?: number | null;
  image?: EmbedMedia | null;
  thumbnail?: EmbedMedia | null;
  author?: { name?: string; url?: string; icon_url?: string } | null;
  footer?: { text: string; icon_url?: string } | null;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

export interface StickerInfo {
  name?: string | null;
  url?: string | null;
}

export interface AttachmentRef {
  name: string;
  url: string;
  contentType?: string | null;
}

export interface ChannelRef {
  channelId: string;
  channelName?: string | null;
  threadId?: string | null;
  threadName?: string | null;
}

export interface ReferenceInfo {
  messageId?: string | null;
  channelId?: string | null;
  guildId?: string | null;
  type?: string | null;
  content?: string | null;
  repliedUsername?: string | null;
  repliedUserId?: string | null;
}

export interface MessageMetadata {
  stickers?: StickerInfo[] | null;
  attachments?: AttachmentRef[] | null;
  embeds?: EmbedInfo[] | null;
  channel?: ChannelRef | null;
  reference?: ReferenceInfo | null;
}

// ── Message Record ──────────────────────────────────────────

export interface MessageRecord {
  id: string;
  guild_id: string;
  channel_id: string;
  thread_id?: string | null;
  reference_message_id?: string | null;
  user_id: string;
  username: string;
  avatar_url?: string | null;
  content: string;
  edited_content?: string | null;
  type: string; // "text" | "edited" | "deleted"
  is_reply?: boolean | null;
  is_forward?: boolean | null;
  is_crosspost?: boolean | null;
  metadata?: string | null; // JSON string of MessageMetadata
  created_at: number;
  edited_at?: number | null;
  deleted_at?: number | null;
  ai_status?: AiStatus | null;
  ai_severity?: AiSeverity | null;
  ai_confidence?: number | null;
  ai_moderation_flags?: string | null; // JSON string array
  ai_moderation_score?: number | null;
  ai_analysis?: string | null;
  ai_categories?: string | null; // JSON string array
  ai_recommended_action?: AiRecommendedAction | null;
  ai_error?: string | null;
  ai_analyzed_at?: number | null;
}

// ── Pagination ──────────────────────────────────────────────

export interface PageResult<T> {
  data: T[];
  nextCursor: string | null;
}

// ── Attachment ──────────────────────────────────────────────

export interface AttachmentRecord {
  id: string;
  message_id: string;
  guild_id: string;
  channel_id: string;
  thread_id?: string | null;
  user_id: string;
  filename: string;
  size: number;
  type: string;
  discord_url: string;
  uploaded_url?: string | null;
  upload_status: "pending" | "uploaded" | "failed";
  upload_error?: string | null;
  created_at: number;
  uploaded_at?: number | null;
}
