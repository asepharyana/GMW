export type ModerationActionType =
  | "delete_message"
  | "mute_user"
  | "warn_user"
  | "kick_user"
  | "ban_user";

export type ModerationStatus = "pending" | "executed" | "failed";

export interface ModerationAction {
  id: string;
  message_id: string | null;
  user_id: string | null;
  guild_id: string;
  action_type: ModerationActionType;
  reason: string | null;
  executed_by: string | null;
  status: ModerationStatus;
  error: string | null;
  created_at: number | null;
  executed_at: number | null;
  username: string | null;
  content: string | null;
}

export interface ModerationStats {
  total: number;
  executed: number;
  failed: number;
  pending: number;
  failed_rate: number;
  by_action: Record<string, ModerationActionType>;
}

export interface PaginatedModerationActions {
  data: ModerationAction[];
  nextCursor: string | null;
}
