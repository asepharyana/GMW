import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import { createChildLogger } from "../shared/logger/index.js";

const logger = createChildLogger("ws.server");

interface BroadcastEvent {
  type: string;
  data: unknown;
  timestamp: string;
}

type BroadcastFn = (data: unknown) => void;

// Extend globalThis with broadcast function types
declare global {
  // biome-ignore lint/suspicious/noAssignInExpressions: intentional global broadcast registry
  var broadcastMessageCreated: BroadcastFn | undefined;
  var broadcastMessageUpdated: BroadcastFn | undefined;
  var broadcastMessageDeleted: BroadcastFn | undefined;
  var broadcastAttachmentUploaded: BroadcastFn | undefined;
}

export function createWebSocketServer(server: Server): WebSocketServer {
  const clients = new Set<WebSocket>();

  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    clients.add(ws);
    logger.info(`Client connected (${clients.size} total)`);

    // Send initial user state
    ws.send(
      JSON.stringify({
        type: "user_state",
        users: [],
      }),
    );

    ws.on("message", (data: Buffer) => {
      // Binary PCM data received from browser.
      // Since backend has no Discord client to relay to, drop it.
      if (Buffer.isBuffer(data) && data.length > 0) {
        logger.debug({ bytes: data.length }, "Dropping binary PCM (no Discord client)");
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
      logger.info(`Client disconnected (${clients.size} total)`);
    });

    ws.on("error", (err: Error) => {
      logger.error({ err }, "WebSocket client error");
      clients.delete(ws);
    });
  });

  // Heartbeat every 30s
  const heartbeatInterval = setInterval(() => {
    const message = JSON.stringify({ type: "heartbeat" });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }, 30_000);

  // Don't let the interval keep the process alive after wss closes
  heartbeatInterval.unref();

  // Expose broadcast functions on globalThis
  function broadcast(event: Omit<BroadcastEvent, "timestamp">) {
    const payload = JSON.stringify({
      ...event,
      timestamp: new Date().toISOString(),
    });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(payload);
        } catch (err) {
          logger.error({ err }, "Failed to broadcast to client");
        }
      }
    }
  }

  globalThis.broadcastMessageCreated = (data: unknown) =>
    broadcast({ type: "message_created", data });
  globalThis.broadcastMessageUpdated = (data: unknown) =>
    broadcast({ type: "message_updated", data });
  globalThis.broadcastMessageDeleted = (data: unknown) =>
    broadcast({ type: "message_deleted", data });
  globalThis.broadcastAttachmentUploaded = (data: unknown) =>
    broadcast({ type: "attachment_uploaded", data });

  // Cleanup on close
  wss.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  logger.info({ path: "/ws" }, "WebSocket server created");

  return wss;
}
