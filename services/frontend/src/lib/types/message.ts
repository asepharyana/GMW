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

export interface CustomEmojiInfo {
  id: string;
  name: string;
  animated?: boolean;
  url?: string | null;
}

export interface MentionedRoleInfo {
  id: string;
  name: string;
}

export interface MentionedUserInfo {
  id: string;
  username: string;
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
  /** Channel topic (captured in gateway metadata.channel.topic). */
  topic?: string | null;
  nsfw?: boolean;
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
  customEmojis?: CustomEmojiInfo[] | null;
  mentionedRoles?: MentionedRoleInfo[] | null;
  mentionedUsers?: MentionedUserInfo[] | null;
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
  reference_channel_id?: string | null;
  reference_guild_id?: string | null;
  user_id: string;
  username: string;
  /** Member's server-specific display name (nickname), from metadata.member.displayName. Falls back to username. */
  server_nick?: string | null;
  avatar_url?: string | null;
  content: string;
  edited_content?: string | null;
  type: "text" | "edited" | "deleted";
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
  ai_analysis_duration_ms?: number | null;
  /** Detail-only: number of past edits (message_edits snapshots) */
  edit_count?: number;
  /** Detail-only: previous content snapshots, newest first */
  edit_history?: Array<{ old_content: string; edited_at: number }>;
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

// ── Semantic Search (read-only public archive search) ──────────

export interface SemanticSearchResult {
  message_id: string | null;
  content: string;
  score: number;
  created_at: number;
  username: string | null;
  channel_id: string | null;
  guild_id: string | null;
  thread_id: string | null;
}

export interface MessageActivityBucket {
  channelId: string;
  channelName: string;
  hour: number;
  count: number;
}

export interface SemanticSearchResponse {
  results: SemanticSearchResult[];
  nextCursor: null;
}
