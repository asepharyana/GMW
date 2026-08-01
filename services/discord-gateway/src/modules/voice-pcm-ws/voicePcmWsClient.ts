/**
 * Direct WebSocket client for streaming voice PCM to the backend.
 *
 * Bypasses Redis pub/sub entirely — gateway connects as a WS client
 * to the backend's existing WebSocket server and sends pre-formatted
 * binary frames (4-byte FNV-1a userId hash + raw Int16LE PCM).
 * The backend forwards these unchanged to frontend clients.
 */

import WebSocket from "ws";
import { createChildLogger } from "@/shared/logger/index";

const logger = createChildLogger("voice-pcm-ws");

/** 32-bit FNV-1a hash — mirrors backend/ws/redis-bridge.ts and frontend useAudioPlayback.ts */
function hashUserId(userId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export class VoicePcmWsClient {
  private ws: WebSocket | null = null;
  private readonly token: string;
  private readonly url: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private reconnectMs = 1000;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  /** Open connection and begin automatic reconnect loop. */
  connect(): void {
    if (this.closed) return;
    this.doConnect();
  }

  /**
   * Send a PCM chunk to the backend.
   *
   * Binary frame format (identical to what frontend expects):
   *   Byte 0–3:  FNV-1a 32-bit userId hash (UInt32LE)
   *   Byte 4+:   PCM audio (24kHz mono Int16LE)
   *
   * Silently drops if not connected — real-time audio, stale
   * chunks from a disconnect gap are useless.
   */
  sendPcm(userId: string, pcmBuffer: Buffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const hash = hashUserId(userId);
    const frame = Buffer.alloc(4 + pcmBuffer.length);
    frame.writeUInt32LE(hash, 0);
    pcmBuffer.copy(frame, 4);

    try {
      this.ws.send(frame);
    } catch (err) {
      logger.warn({ err }, "Failed to send PCM frame");
    }
  }

  /** Graceful close — send close frame, clear reconnect timer. */
  async close(): Promise<void> {
    this.closed = true;
    this.clearReconnectTimer();

    if (!this.ws) return;

    // Remove listeners so reconnect doesn't fire during close
    this.ws.removeAllListeners();

    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(1000, "shutdown");
    }

    this.ws = null;
  }

  // ── internals ────────────────────────────────────────────────────────

  private getUrlWithAuth(): string {
    const sep = this.url.includes("?") ? "&" : "?";
    return `${this.url}${sep}token=${encodeURIComponent(this.token)}`;
  }

  private doConnect(): void {
    if (this.closed) return;

    const authUrl = this.getUrlWithAuth();
    logger.info({ url: this.url }, "Connecting to backend WebSocket");

    try {
      this.ws = new WebSocket(authUrl);
    } catch (err) {
      logger.error({ err }, "Failed to create WebSocket");
      this.scheduleReconnect();
      return;
    }

    this.ws.on("open", () => {
      logger.info("Voice PCM WS client connected");
      this.reconnectMs = 1000; // reset backoff on successful connect
    });

    this.ws.on("close", (code, reason) => {
      logger.warn(
        { code, reason: reason.toString() },
        "Voice PCM WS client disconnected",
      );
      this.ws = null;
      this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      logger.error({ err: err.message }, "Voice PCM WS client error");
      // on("close") fires after on("error") — reconnect handled there
    });
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    this.clearReconnectTimer();

    // Exponential backoff with jitter: 1s → 2s → 4s → ... → 30s cap
    const delay = this.reconnectMs + Math.random() * 1000;
    logger.info({ delayMs: Math.round(delay) }, "Scheduling WS reconnect");

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closed) {
        this.doConnect();
      }
    }, delay);

    this.reconnectMs = Math.min(this.reconnectMs * 2, 30_000);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
