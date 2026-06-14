// ─── WebSocket singleton with reconnect, typed events, and observable status ─
import { useCallback, useEffect, useRef, useState } from "react";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("socket");

export type WsStatus = "connecting" | "connected" | "disconnected" | "error";

export type BinaryHandler = (data: ArrayBuffer) => void;

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const MAX_RECONNECT_ATTEMPTS = 20;

function computeBackoff(attempt: number): number {
  const delay = Math.min(
    RECONNECT_BASE_MS * Math.pow(2, attempt),
    RECONNECT_MAX_MS,
  );
  // Full jitter: random between 50% and 100% of delay
  return delay * (0.5 + Math.random() * 0.5);
}

export interface WsHandlers {
  onBinary?: BinaryHandler;
  onMessageCreated?: (data: unknown) => void;
  onMessageUpdated?: (data: unknown) => void;
  onMessageDeleted?: (data: unknown) => void;
  onMessageAnalyzed?: (data: unknown) => void;
  onAttachmentCreated?: (data: unknown) => void;
  onAttachmentUploaded?: (data: unknown) => void;
  onUserState?: (users: unknown[]) => void;
  onUiState?: (state: unknown) => void;
  onMediaState?: (state: unknown) => void;
  onVoiceRecordingStarted?: (data: unknown) => void;
  onVoiceRecordingStopped?: (data: unknown) => void;
  onVoiceRecordingUploaded?: (data: unknown) => void;
  onVoicePcmData?: (data: unknown) => void;
  onVoiceActiveUser?: (data: unknown) => void;
  onReactionAdded?: (data: unknown) => void;
  onReactionRemoved?: (data: unknown) => void;
  onThreadCreated?: (data: unknown) => void;
  onThreadDeleted?: (data: unknown) => void;
  onThreadUpdated?: (data: unknown) => void;
  onChannelTopicUpdated?: (data: unknown) => void;
  onPresenceUpdated?: (data: unknown) => void;
  onGuildMemberAdded?: (data: unknown) => void;
  onGuildMemberRemoved?: (data: unknown) => void;
  onVoiceAnalyzed?: (data: unknown) => void;
}

let _wsInstance: WebSocket | null = null;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _closed = false;
let _reconnectAttempts = 0;
const _listeners = new Set<WsHandlers>();
const _statusCallbacks = new Set<(s: WsStatus) => void>();

function dispatchStatus(s: WsStatus): void {
  for (const cb of _statusCallbacks) cb(s);
}

function doConnect(): WebSocket {
  const BE_WS_URL =
    import.meta.env.VITE_BE_WS_URL ||
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
  const url = BE_WS_URL.endsWith("/ws") ? BE_WS_URL : `${BE_WS_URL}/ws`;
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";
  dispatchStatus("connecting");
  logger.info("Connecting", { url });

  ws.addEventListener("open", () => {
    _reconnectAttempts = 0;
    dispatchStatus("connected");
    logger.info("Connected");
  });
  ws.addEventListener("error", () => {
    dispatchStatus("error");
    logger.error("WebSocket error");
  });
  ws.addEventListener("close", (event) => {
    dispatchStatus("disconnected");
    logger.info("Disconnected", { code: event.code, reason: event.reason });
    if (!_closed && _listeners.size > 0) {
      _reconnectAttempts++;
      if (_reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
        logger.error("Max reconnect attempts reached, giving up", {
          attempts: _reconnectAttempts,
        });
        dispatchStatus("disconnected");
        return;
      }
      const delay = computeBackoff(_reconnectAttempts);
      logger.warn("Reconnecting", {
        attempt: _reconnectAttempts,
        delayMs: Math.round(delay),
      });
      _reconnectTimer = setTimeout(() => doReconnect(), delay);
    }
  });
  ws.addEventListener("message", (event) => {
    if (event.data instanceof ArrayBuffer) {
      for (const h of _listeners) h.onBinary?.(event.data);
      return;
    }
    if (typeof event.data !== "string") return;
    try {
      const msg = JSON.parse(event.data) as Record<string, unknown>;
      for (const h of _listeners) {
        switch (msg.type) {
          case "message_created":
            if (msg.data !== undefined) h.onMessageCreated?.(msg.data);
            break;
          case "message_updated":
            if (msg.data !== undefined) h.onMessageUpdated?.(msg.data);
            break;
          case "message_deleted":
            if (msg.data !== undefined) h.onMessageDeleted?.(msg.data);
            break;
          case "message_analyzed":
            if (msg.data !== undefined) h.onMessageAnalyzed?.(msg.data);
            break;
          case "attachment_created":
            if (msg.data !== undefined) h.onAttachmentCreated?.(msg.data);
            break;
          case "attachment_uploaded":
            if (msg.data !== undefined) h.onAttachmentUploaded?.(msg.data);
            break;
          case "user_state":
            h.onUserState?.((msg.users as unknown[]) || []);
            break;
          case "ui_state":
            h.onUiState?.(msg.state);
            break;
          case "media_state":
            h.onMediaState?.(msg.state);
            break;
          case "voice_recording_started":
            if (msg.data !== undefined) h.onVoiceRecordingStarted?.(msg.data);
            break;
          case "voice_recording_stopped":
            if (msg.data !== undefined) h.onVoiceRecordingStopped?.(msg.data);
            break;
          case "voice_recording_uploaded":
            if (msg.data !== undefined) h.onVoiceRecordingUploaded?.(msg.data);
            break;
          case "voice_pcm_data":
            if (msg.data !== undefined) h.onVoicePcmData?.(msg.data);
            break;
          case "voice_active_user":
            if (msg.data !== undefined) h.onVoiceActiveUser?.(msg.data);
            break;
          case "voice_analyzed":
            if (msg.data !== undefined) h.onVoiceAnalyzed?.(msg.data);
            break;
          case "reaction_added":
            if (msg.data !== undefined) h.onReactionAdded?.(msg.data);
            break;
          case "reaction_removed":
            if (msg.data !== undefined) h.onReactionRemoved?.(msg.data);
            break;
          case "thread_created":
            if (msg.data !== undefined) h.onThreadCreated?.(msg.data);
            break;
          case "thread_deleted":
            if (msg.data !== undefined) h.onThreadDeleted?.(msg.data);
            break;
          case "thread_updated":
            if (msg.data !== undefined) h.onThreadUpdated?.(msg.data);
            break;
          case "channel_topic_updated":
            if (msg.data !== undefined) h.onChannelTopicUpdated?.(msg.data);
            break;
          case "presence_updated":
            if (msg.data !== undefined) h.onPresenceUpdated?.(msg.data);
            break;
          case "guild_member_added":
            if (msg.data !== undefined) h.onGuildMemberAdded?.(msg.data);
            break;
          case "guild_member_removed":
            if (msg.data !== undefined) h.onGuildMemberRemoved?.(msg.data);
            break;
          case "analysis_queue_status":
            // monitoring-only — no UI action needed
            break;
        }
      }
    } catch {
      logger.error("Failed to parse message", {
        raw: event.data.slice(0, 200),
      });
    }
  });

  return ws;
}

function doReconnect(): void {
  if (_wsInstance) {
    _wsInstance.close();
    if (_reconnectTimer) clearTimeout(_reconnectTimer);
  }
  _closed = false;
  _wsInstance = doConnect();
}

function ensureConnected(): void {
  if (!_wsInstance || _wsInstance.readyState === WebSocket.CLOSED) {
    if (_wsInstance) {
      _wsInstance.close();
      if (_reconnectTimer) clearTimeout(_reconnectTimer);
    }
    _closed = false;
    _wsInstance = doConnect();
  }
}

export function useDashboardSocket(handlers: WsHandlers) {
  const [status, setStatus] = useState<WsStatus>("connecting");
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const wrapper: WsHandlers = {
      onBinary: (d) => handlersRef.current.onBinary?.(d),
      onMessageCreated: (d) => handlersRef.current.onMessageCreated?.(d),
      onMessageUpdated: (d) => handlersRef.current.onMessageUpdated?.(d),
      onMessageDeleted: (d) => handlersRef.current.onMessageDeleted?.(d),
      onMessageAnalyzed: (d) => handlersRef.current.onMessageAnalyzed?.(d),
      onAttachmentCreated: (d) => handlersRef.current.onAttachmentCreated?.(d),
      onAttachmentUploaded: (d) =>
        handlersRef.current.onAttachmentUploaded?.(d),
      onUserState: (u) => handlersRef.current.onUserState?.(u),
      onUiState: (s) => handlersRef.current.onUiState?.(s),
      onMediaState: (s) => handlersRef.current.onMediaState?.(s),
      onVoiceRecordingStarted: (d) =>
        handlersRef.current.onVoiceRecordingStarted?.(d),
      onVoiceRecordingStopped: (d) =>
        handlersRef.current.onVoiceRecordingStopped?.(d),
      onVoiceRecordingUploaded: (d) =>
        handlersRef.current.onVoiceRecordingUploaded?.(d),
      onVoicePcmData: (d) => handlersRef.current.onVoicePcmData?.(d),
      onVoiceActiveUser: (d) => handlersRef.current.onVoiceActiveUser?.(d),
      onReactionAdded: (d) => handlersRef.current.onReactionAdded?.(d),
      onReactionRemoved: (d) => handlersRef.current.onReactionRemoved?.(d),
      onThreadCreated: (d) => handlersRef.current.onThreadCreated?.(d),
      onThreadDeleted: (d) => handlersRef.current.onThreadDeleted?.(d),
      onThreadUpdated: (d) => handlersRef.current.onThreadUpdated?.(d),
      onChannelTopicUpdated: (d) =>
        handlersRef.current.onChannelTopicUpdated?.(d),
      onPresenceUpdated: (d) => handlersRef.current.onPresenceUpdated?.(d),
      onGuildMemberAdded: (d) => handlersRef.current.onGuildMemberAdded?.(d),
      onGuildMemberRemoved: (d) =>
        handlersRef.current.onGuildMemberRemoved?.(d),
      onVoiceAnalyzed: (d) => handlersRef.current.onVoiceAnalyzed?.(d),
    };

    _listeners.add(wrapper);
    _statusCallbacks.add(setStatus);

    if (_listeners.size === 1) {
      ensureConnected();
    }

    return () => {
      _listeners.delete(wrapper);
      _statusCallbacks.delete(setStatus);
      if (_listeners.size === 0) {
        _closed = true;
        if (_reconnectTimer) clearTimeout(_reconnectTimer);
        _wsInstance?.close();
        _wsInstance = null;
      }
    };
  }, []);

  const send = useCallback((data: ArrayBuffer | string) => {
    if (_wsInstance?.readyState === WebSocket.OPEN) {
      _wsInstance.send(data);
    }
  }, []);

  return { status, send, socketRef: { current: _wsInstance } };
}
