// Shared message row mapper for backend repository modules

export interface MappedMessage {
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
  type: string;
  metadata: string | null;
  ai_status: string | null;
  ai_moderation_flags: string | null;
  ai_moderation_score: number | null;
  ai_analysis: string | null;
  ai_categories: string | null;
  ai_severity: string | null;
  ai_confidence: number | null;
  ai_recommended_action: string | null;
  ai_analyzed_at: number | null;
  ai_error: string | null;
  is_reply: boolean | null;
  is_forward: boolean | null;
  is_crosspost: boolean | null;
  reference_message_id: string | null;
  reference_channel_id: string | null;
  reference_guild_id: string | null;
}

export function mapMessageRow(row: Record<string, unknown>): MappedMessage {
  return {
    id: String(row.id ?? ""),
    guild_id: String(row.guild_id ?? ""),
    channel_id: String(row.channel_id ?? ""),
    thread_id: (row.thread_id as string | null) ?? null,
    user_id: String(row.user_id ?? ""),
    username: String(row.username ?? ""),
    avatar_url: (row.avatar_url as string | null) ?? null,
    content: String(row.content ?? ""),
    edited_content: (row.edited_content as string | null) ?? null,
    created_at: Number(row.created_at ?? 0),
    edited_at: (row.edited_at as number | null) ?? null,
    deleted_at: (row.deleted_at as number | null) ?? null,
    type: String(row.type ?? "text"),
    metadata: (row.metadata as string | null) ?? null,
    ai_status: (row.ai_status as string | null) ?? null,
    ai_moderation_flags: (row.ai_moderation_flags as string | null) ?? null,
    ai_moderation_score: (row.ai_moderation_score as number | null) ?? null,
    ai_analysis: (row.ai_analysis as string | null) ?? null,
    ai_categories: (row.ai_categories as string | null) ?? null,
    ai_severity: (row.ai_severity as string | null) ?? null,
    ai_confidence: (row.ai_confidence as number | null) ?? null,
    ai_recommended_action: (row.ai_recommended_action as string | null) ?? null,
    ai_analyzed_at: (row.ai_analyzed_at as number | null) ?? null,
    ai_error: (row.ai_error as string | null) ?? null,
    is_reply: row.is_reply === null ? null : Boolean(row.is_reply),
    is_forward: row.is_forward === null ? null : Boolean(row.is_forward),
    is_crosspost: row.is_crosspost === null ? null : Boolean(row.is_crosspost),
    reference_message_id: (row.reference_message_id as string | null) ?? null,
    reference_channel_id: (row.reference_channel_id as string | null) ?? null,
    reference_guild_id: (row.reference_guild_id as string | null) ?? null,
  };
}
