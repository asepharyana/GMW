import type { WsEvent, WsStatus } from "./types";

type WsEventCallback = (event: WsEvent) => void;

/**
 * WebSocket URL resolution — same-origin by default (gmw-proxy nginx
 * proxies /ws to the backend). Override for local dev with NEXT_PUBLIC_WS_URL.
 */
function getWsUrl(): string {
  const override =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_WS_URL : "";
  if (override) return override.replace(/\/+$/, "");

  if (typeof window === "undefined") return "wss://localhost/ws";

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const port = window.location.port;
  return `${protocol}://${window.location.hostname}${port ? `:${port}` : ""}/ws`;
}

export class WsConnection {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempt = 0;
  private maxReconnectAttempts = 20;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private _status: WsStatus = "disconnected";
  private statusListeners: Array<(status: WsStatus) => void> = [];
  private eventListeners: Array<WsEventCallback> = [];
  private destroyed = false;

  constructor(url?: string) {
    this.url = url ?? getWsUrl();
  }

  get status(): WsStatus {
    return this._status;
  }

  /** Current reconnect attempt count (0 = connected/first attempt). */
  get reconnectAttemptCount(): number {
    return this.reconnectAttempt;
  }

  onStatusChange(listener: (status: WsStatus) => void): () => void {
    this.statusListeners.push(listener);
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== listener);
    };
  }

  onEvent(listener: WsEventCallback): () => void {
    this.eventListeners.push(listener);
    return () => {
      this.eventListeners = this.eventListeners.filter((l) => l !== listener);
    };
  }

  connect(): void {
    if (this.destroyed) return;
    if (this._status === "connected" || this._status === "connecting") return;

    this.setStatus("connecting");

    try {
      this.ws = new WebSocket(this.url);
    } catch (_err) {
      this.setStatus("error");
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.setStatus("connected");
    };

    this.ws.onclose = () => {
      this.setStatus("disconnected");
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.setStatus("error");
    };

    this.ws.onmessage = (msg: MessageEvent) => {
      if (typeof msg.data === "string") {
        this.dispatchEvent({ type: "text", data: msg.data });
      } else if (msg.data instanceof ArrayBuffer) {
        this.dispatchEvent({ type: "binary", data: msg.data });
      } else if (msg.data instanceof Blob) {
        // Blob — convert to ArrayBuffer
        msg.data.arrayBuffer().then((buffer) => {
          this.dispatchEvent({ type: "binary", data: buffer });
        });
      }
    };
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.onclose = null; // prevent reconnect
      this.ws.close();
      this.ws = null;
    }
    this.setStatus("disconnected");
  }

  destroy(): void {
    this.destroyed = true;
    this.disconnect();
    this.statusListeners = [];
    this.eventListeners = [];
  }

  sendText(text: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(text);
    }
  }

  sendBinary(data: ArrayBufferLike): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data as ArrayBuffer);
    }
  }

  private setStatus(status: WsStatus): void {
    if (this._status === status) return;
    this._status = status;
    this.statusListeners.forEach((l) => l(status));
  }

  private dispatchEvent(event: WsEvent): void {
    this.eventListeners.forEach((l) => l(event));
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectAttempt >= this.maxReconnectAttempts)
      return;

    // Full-jitter exponential backoff: min(1000 * 2^attempt, 30000) * (0.5 + random * 0.5)
    const base = Math.min(1000 * 2 ** this.reconnectAttempt, 30000);
    const jitter = 0.5 + Math.random() * 0.5;
    const delay = Math.floor(base * jitter);

    this.reconnectAttempt++;

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }
}
