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
  // ── Explainability (structured verdict, surfaced read-only to public web) ──
  flags: string[] | null;
  categories: string[] | null;
  severity: "none" | "low" | "medium" | "high" | "critical" | null;
  confidence: number | null;
  score: number | null;
  evidence: string[] | null;
  policy_version: string | null;
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

export interface ModerationTrends {
  categories: { name: string; count: number }[];
  severities: { level: string; count: number }[];
  actions: { type: string; count: number }[];
}

export interface FlaggedDomain {
  domain: string;
  count: number;
}

export interface FlaggedChannel {
  channel_id: string;
  channel_name: string | null;
  flagged_count: number;
}

export interface HourlyModeration {
  hour: number;
  total: number;
}

export interface CategoryAction {
  id: string;
  message_id: string | null;
  user_id: string | null;
  guild_id: string;
  action_type: ModerationActionType;
  reason: string | null;
  status: ModerationStatus;
  created_at: number | null;
  severity: "none" | "low" | "medium" | "high" | "critical" | null;
  confidence: number | null;
  score: number | null;
  username: string | null;
  content: string | null;
}

export interface ModerationCoverage {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  coverage_rate: number;
  failed_rate: number;
}
