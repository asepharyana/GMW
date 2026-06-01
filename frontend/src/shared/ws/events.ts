// ─── Typed event map for WebSocket events ────────────────────────────────────

export interface WsEventMap {
  message_created: { data: unknown };
  message_updated: { data: unknown };
  message_deleted: { data: { id: string } };
  message_analyzed: { data: unknown };
  attachment_uploaded: Record<string, never>;
  user_state: { users: unknown[] };
  ui_state: { state: unknown };
  media_state: { state: unknown };
  voice_recording_uploaded: { data: unknown };
}

export type WsEventType = keyof WsEventMap;

export function parseWsMessage(raw: string): { type: WsEventType; payload: Record<string, unknown> } | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.type) return null;
    const { type, ...rest } = parsed;
    return { type: type as WsEventType, payload: rest };
  } catch {
    return null;
  }
}
