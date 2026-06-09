// ─── Typed event map for WebSocket events ────────────────────────────────────

export interface WsEventMap {
  message_created: { data: unknown };
  message_updated: { data: unknown };
  message_deleted: { data: { id: string } };
  message_analyzed: { data: unknown };
  attachment_uploaded: { data: unknown };
  user_state: { users: unknown[] };
  ui_state: { state: unknown };
  media_state: { state: unknown };
  voice_recording_uploaded: { data: unknown };
  voice_recording_started: { data: unknown };
  voice_recording_stopped: { data: unknown };
  voice_pcm_data: { data: unknown };
  voice_active_user: { data: unknown };
  attachment_created: { data: unknown };
  analysis_queue_status: { data: unknown };
}

export type WsEventType = keyof WsEventMap;

export function parseWsMessage(
  raw: string,
): { type: WsEventType; payload: Record<string, unknown> } | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.type) return null;
    const { type, ...rest } = parsed;
    return { type: type as WsEventType, payload: rest };
  } catch {
    return null;
  }
}
