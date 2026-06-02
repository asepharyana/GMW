export type AIStatus = "pending" | "clean" | "warn" | "flagged" | "error";
export type AISeverity = "none" | "low" | "medium" | "high" | "critical";
export type AIRecommendedAction =
  | "none"
  | "monitor"
  | "warn"
  | "review"
  | "delete"
  | "escalate";

export interface MessageMetadata {
  stickers?: Array<{ name?: string; url?: string }>;
  attachments?: Array<{ name: string; url: string; contentType?: string }>;
  embeds?: Array<{ title?: string; image?: string; thumbnail?: string }>;
}

export function parseMetadata(value: string | null): MessageMetadata {
  if (!value) return {};
  try {
    return JSON.parse(value) as MessageMetadata;
  } catch {
    return {};
  }
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

export interface PageResult<T> {
  data: T[];
  nextCursor: string | null;
}
