import type {
  AnalysisQueueStatus,
  AttachmentRecord,
  MessageRecord,
} from "../../shared/moderation-types.js";

// Re-export all shared types for backward compatibility
export type {
  AIRecommendedAction,
  AISeverity,
  AIStatus,
  AnalysisQueueStatus,
  AnalysisResult,
  AttachmentRecord,
  BroadcasterClient,
  DashboardMessage,
  MessageQuery,
  MessageRecord,
  MessageReview,
  ModerationAction,
  ModerationActionType,
  ModerationBroadcaster,
  PageResult,
  RetentionPolicy,
  ReviewStatus,
  RoleMetadata,
  UserMetadata,
} from "../../shared/moderation-types.js";

// Local-only types (not shared across services)
export type ModerationWsEvent =
  | { type: "ui_state"; state: unknown }
  | { type: "user_state"; users: unknown[] }
  | { type: "message_created"; data: MessageRecord }
  | { type: "message_updated"; data: Partial<MessageRecord> & { id: string } }
  | { type: "message_deleted"; data: { id: string; deleted_at: number } }
  | { type: "message_analyzed"; data: MessageRecord }
  | { type: "attachment_created"; data: AttachmentRecord }
  | { type: "analysis_queue_status"; data: AnalysisQueueStatus };
