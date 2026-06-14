// ─── Typed event map for WebSocket events ────────────────────────────────────
//
// Types correspond to the data field sent by the backend's broadcastEvent().
// The backend unwraps the DiscordGatewayEvent envelope and forwards only
// the inner `data` field to frontend WebSocket clients.

import type {
  AnalysisQueueStatus,
  AttachmentRecord,
  MessageRecord,
  VoiceRecordingUploadData,
} from "@bete/shared";

export interface ActiveSpeakerData {
  userId: string;
  username: string;
  avatar: string;
  speaking: boolean;
}

export interface WsEventMap {
  message_created: { data: MessageRecord };
  message_updated: { data: MessageRecord & { edited_content?: string | null } };
  message_deleted: {
    data: { id: string; channel_id?: string; deleted_at: number };
  };
  message_analyzed: { data: MessageRecord };
  attachment_created: { data: AttachmentRecord };
  attachment_uploaded: { data: AttachmentRecord };
  voice_recording_started: { data: Record<string, unknown> };
  voice_recording_stopped: {
    data: {
      guild_id: string;
      session_id: string;
      duration_ms: number;
      participants: number;
      segment_count: number;
      status: string;
      stopped_at: number;
    };
  };
  voice_recording_uploaded: { data: VoiceRecordingUploadData };
  voice_pcm_data: {
    data: { userId: string; pcm: string; metadata?: Record<string, unknown> };
  };
  voice_analyzed: { data: Record<string, unknown> };
  voice_active_user: { data: ActiveSpeakerData };
  user_state: { users: unknown[] };
  ui_state: { state: Record<string, unknown> };
  media_state: { state: Record<string, unknown> };
  analysis_queue_status: { data: AnalysisQueueStatus };
  reaction_added: { data: Record<string, unknown> };
  reaction_removed: { data: Record<string, unknown> };
  thread_created: { data: Record<string, unknown> };
  thread_deleted: { data: Record<string, unknown> };
  thread_updated: { data: Record<string, unknown> };
  channel_topic_updated: { data: Record<string, unknown> };
  presence_updated: { data: Record<string, unknown> };
  guild_member_added: { data: Record<string, unknown> };
  guild_member_removed: { data: Record<string, unknown> };
  heartbeat: { data?: { timestamp: number } };
}

export type WsEventType = keyof WsEventMap;

export function parseWsMessage(
  raw: string,
): { type: WsEventType; payload: Record<string, unknown> } | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.type || typeof parsed.type !== "string") return null;
    const { type, ...rest } = parsed;
    return { type: type as WsEventType, payload: rest };
  } catch {
    return null;
  }
}
