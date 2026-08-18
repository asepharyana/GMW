import type {
  ActiveSpeaker,
  MediaState,
  MessageRecord,
  ModerationAction,
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
  /**
   * The gateway broadcasts a PARTIAL update: { id } plus the changed fields
   * (edited_content, edited_at, type, and the reset ai_* fields). It is NOT a
   * full MessageRecord — merge it, never rely on it carrying the full row.
   */
  message_updated: Partial<MessageRecord> & { id: string };
  /** Gateway emits { id, deleted_at } — NOT a bare string */
  message_deleted: { id: string; deleted_at?: number };
  message_analyzed: MessageRecord;
  /**
   * Streamed history frame — one MessageRecord per WS message (replaces the old
   * 50-row batched `messages.list` fetch on the client). The view accumulates
   * these into the SWR list as they arrive. `message_snapshot_end` signals done.
   */
  message_snapshot: MessageRecord;
  message_snapshot_end: { sent: number; error?: boolean };
  attachment_created: unknown;
  attachment_uploaded: unknown;
  voice_recording_started: unknown;
  voice_recording_stopped: unknown;
  voice_recording_uploaded: VoiceRecording;
  voice_active_user: ActiveSpeaker;
  /**
   * Authoritative shared live-voice snapshot — `{ activeSpeakers: [...] }`.
   * The backend sends this on WS connect (initial state) and clients replace
   * their local list wholesale so every user converges on the same state.
   */
  voice_state: { activeSpeakers: ActiveSpeaker[] };
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
  /** Live moderation action broadcast (gateway → Redis → backend → WS). */
  moderation_action: ModerationAction;
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
