import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import type { MessageQuery } from "../modules/messages/messages.schema.js";
import { messagesService } from "../modules/messages/messages.service.js";
import { createChildLogger } from "../shared/logger/index.js";
import { setBroadcastFunctions } from "./broadcast.js";

const logger = createChildLogger("ws.server");

interface BroadcastEvent {
  type: string;
  data: unknown;
  timestamp: string;
}

interface JsonMessage {
  type: string;
  payload?: Record<string, unknown>;
}

/** Payload accepted by the `stream_messages` JSON command. */
interface StreamMessagesPayload {
  guildId?: string;
  channelId?: string;
  cursor?: string;
  limit?: number;
}

// Track the active WebSocket server for lifecycle management
let _wss: WebSocketServer | null = null;

type MessageHandler = (
  ws: WebSocket,
  message: JsonMessage,
) => Promise<void> | void;

async function sendInitialStates(ws: WebSocket): Promise<void> {
  // Send initial user state
  ws.send(
    JSON.stringify({
      type: "user_state",
      users: [],
    }),
  );

  // Send initial UI state from database
  try {
    const { uiStateService } = await import(
      "../modules/ui-state/ui-state.service.js"
    );
    const uiState = await uiStateService.getState();
    ws.send(
      JSON.stringify({
        type: "ui_state",
        state: uiState,
      }),
    );
  } catch (err) {
    logger.warn({ err }, "Failed to send initial ui_state");
  }
}

export function closeWebSocketServer(): void {
  if (!_wss) return;
  logger.info("Closing WebSocket server");
  _wss.close(() => logger.info("WebSocket server closed"));
  _wss = null;
}

export function createWebSocketServer(server: Server): WebSocketServer {
  const frontendClients = new Set<WebSocket>();

  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: true });
  _wss = wss;

  // Manual upgrade routing: without this, two `ws` servers bound to the same
  // http.Server via the `server` option both register `upgrade` listeners and
  // the path-guarded one destructively rejects the other's path (400). We own
  // the upgrade event and dispatch by URL instead.
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!req.url?.startsWith("/ws")) return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  // Map-based dispatcher for JSON WebSocket message types
  const jsonHandlers = new Map<string, MessageHandler>();

  jsonHandlers.set("stream_messages", async (ws, message) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const payload = (message.payload ?? {}) as StreamMessagesPayload;
    const guildId = payload.guildId;
    const channelId = payload.channelId;
    if (!guildId && !channelId) {
      logger.warn({ payload }, "stream_messages requires guildId or channelId");
      return;
    }

    const pageSize = 50; // internal DB page size; still emitted one frame at a time
    const maxFrames = Math.min(payload.limit ?? 200, 500);

    /** Send the end-of-stream frame, reporting sent count + next cursor. */
    function sendEnd(data: Record<string, unknown>): void {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(
        JSON.stringify({
          type: "message_snapshot_end",
          data,
        }),
      );
    }

    let sent = 0;
    let nextCursor: string | null = null;
    try {
      for await (const msg of messagesService.streamMessages(
        {
          guildId,
          channelId,
          cursor: payload.cursor,
        } as MessageQuery,
        pageSize,
      )) {
        if (ws.readyState !== WebSocket.OPEN) break;
        // Streamed DESC (newest first); the oldest emitted carries the smallest
        // created_at, which is exactly the next-page cursor for "load older".
        const createdAt = (msg as { created_at?: number }).created_at;
        if (createdAt !== undefined) nextCursor = String(createdAt);
        ws.send(
          JSON.stringify({
            type: "message_snapshot",
            data: msg,
          }),
        );
        sent++;
        if (sent >= maxFrames) break;
      }
      sendEnd({ sent, nextCursor });
    } catch (err) {
      logger.error({ err }, "stream_messages failed");
      sendEnd({ sent, nextCursor, error: true });
    }
  });

  wss.on("connection", (ws: WebSocket) => {
    frontendClients.add(ws);
    logger.info(`Frontend client connected (${frontendClients.size} total)`);
    // Send initial states (user, ui) — fire-and-forget
    sendInitialStates(ws).catch((err) =>
      logger.error({ err }, "sendInitialStates failed"),
    );

    ws.on("message", (data: Buffer) => {
      // Handle JSON messages from browser
      if (
        typeof data === "string" ||
        (Buffer.isBuffer(data) && data.length > 0 && data[0] === 0x7b)
      ) {
        try {
          const message = JSON.parse(data.toString());
          const handler = jsonHandlers.get(message.type);
          if (handler) {
            Promise.resolve(handler(ws, message)).catch((err: Error) => {
              logger.error({ err }, "JSON message handler failed");
            });
          }
        } catch (err) {
          logger.debug({ err }, "Failed to parse WebSocket message as JSON");
        }
      }
    });

    ws.on("close", () => {
      frontendClients.delete(ws);
      logger.info(
        `Frontend client disconnected (${frontendClients.size} total)`,
      );
    });

    ws.on("error", (err: Error) => {
      logger.error({ err }, "WebSocket client error");
      frontendClients.delete(ws);
    });
  });

  // Heartbeat every 30s — frontend clients only
  const heartbeatInterval = setInterval(() => {
    const message = JSON.stringify({ type: "heartbeat" });
    for (const client of frontendClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }, 30_000);

  // Don't let the interval keep the process alive after wss closes
  heartbeatInterval.unref();

  // JSON event broadcast — frontend clients only
  function broadcast(event: Omit<BroadcastEvent, "timestamp">) {
    const payload = JSON.stringify({
      ...event,
      timestamp: new Date().toISOString(),
    });
    for (const client of frontendClients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(payload);
        } catch (err) {
          logger.error({ err }, "Failed to broadcast to client");
        }
      }
    }
  }

  function broadcastBinary(data: Buffer) {
    for (const client of frontendClients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(data);
        } catch (err) {
          logger.error({ err }, "Failed to broadcast binary data to client");
        }
      }
    }
  }

  setBroadcastFunctions(
    (type: string, data: unknown) => broadcast({ type, data }),
    broadcastBinary,
  );

  // Cleanup on close
  wss.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  logger.info({ path: "/ws" }, "WebSocket server created");

  return wss;
}
