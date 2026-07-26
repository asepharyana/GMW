import type {
  ActiveSpeaker,
  MediaState,
  MessageRecord,
  VoiceRecording,
} from "@/lib/types";

// ── Connection Status ──────────────────────────────────────

export type WsStatus = "disconnected" | "connecting" | "connected" | "error";

// ── Raw Events (from WebSocket) ────────────────────────────

export type WsEvent = WsTextEvent | WsBinaryEvent;

export interface WsTextEvent {
  type: "text";
  data: string;
}

export interface WsBinaryEvent {
  type: "binary";
  data: ArrayBuffer;
}

// ── Typed Event Map ───────────────────────────────────────

export interface WsEventMap {
  message_created: MessageRecord;
  message_updated: MessageRecord;
  message_deleted: string; // message ID
  message_analyzed: MessageRecord;
  attachment_created: unknown;
  attachment_uploaded: unknown;
  voice_recording_started: unknown;
  voice_recording_stopped: unknown;
  voice_recording_uploaded: VoiceRecording;
  voice_active_user: ActiveSpeaker;
  /** NOT delivered as JSON — arrives only via onPcm() binary handler as PcmChunk */
  voice_pcm_data: never;
  voice_analyzed: unknown;
  analysis_queue_status: unknown;
  reaction_added: unknown;
  reaction_removed: unknown;
  thread_created: unknown;
  thread_deleted: unknown;
  thread_updated: unknown;
  channel_topic_updated: unknown;
  presence_updated: unknown;
  guild_member_added: unknown;
  guild_member_removed: unknown;
  media_state: MediaState;
  user_state: unknown;
  ui_state: unknown;
  heartbeat: unknown;
}

export type WsEventType = keyof WsEventMap;

export type WsEventHandler<E extends WsEventType = WsEventType> = (
  data: WsEventMap[E],
) => void;

// ── Binary PCM ─────────────────────────────────────────────

export interface PcmChunk {
  userIdHash: number;
  samples: Int16Array;
}
