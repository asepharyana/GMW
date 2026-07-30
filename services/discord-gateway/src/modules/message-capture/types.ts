import type fs from "node:fs";
import type {
  AnalysisQueueStatus,
  AttachmentRecord,
  MessageRecord,
  UserMetadata,
  VoiceRecordingUploadData,
} from "../../shared/index.js";
import type prism from "prism-media";

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
  VoiceRecordingUploadData,
  VoiceSegmentRecord,
} from "../../shared/index.js";

// Types that are LOCAL ONLY (not in shared) — keep here
export interface SegmentState {
  index: number;
  startTime: number;
  endTime: number | null;
  filename: string;
  jsonFilename: string;
  oggStream: prism.opus.OggLogicalBitstream;
  out: fs.WriteStream;
}

export interface SegmentMetadata extends UserMetadata {
  recordingSessionId: string;
  sessionId: string;
  sessionStartTime: number;
  segmentIndex: number;
  segmentMs: number;
  startTime: number;
  endTime: number;
  durationMs: number;
  filename: string;
}

export interface PcmBroadcaster {
  broadcastPcmToWeb?: (chunk: Buffer, userId: string) => void;
  updateActiveUser?: (
    userId: string,
    data: { username: string; avatar: string; speaking: boolean },
  ) => void;
}

// Local-only types (not shared across services)
export type ModerationWsEvent =
  | { type: "ui_state"; state: unknown }
  | { type: "user_state"; users: unknown[] }
  | { type: "message_created"; data: MessageRecord }
  | { type: "message_updated"; data: Partial<MessageRecord> & { id: string } }
  | { type: "message_deleted"; data: { id: string; deleted_at: number } }
  | { type: "message_analyzed"; data: MessageRecord }
  | { type: "attachment_created"; data: AttachmentRecord }
  | { type: "analysis_queue_status"; data: AnalysisQueueStatus }
  | { type: "media_state"; state: unknown }
  | { type: "voice_recording_uploaded"; data: VoiceRecordingUploadData };
