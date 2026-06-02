import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { createChildLogger } from "../shared/logger/index.js";

const logger = createChildLogger("ws.server");

interface BroadcastEvent {
  type: string;
  data: unknown;
  timestamp: string;
}

// Extend globalThis with broadcast function types
declare global {
  var __broadcastFns:
    | {
        messageCreated: (data: unknown) => void;
        messageUpdated: (data: unknown) => void;
        messageDeleted: (data: unknown) => void;
        attachmentUploaded: (data: unknown) => void;
        raw: (type: string, data: unknown) => void;
      }
    | undefined;
}

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

  // Send initial media state
  try {
    const { getStatus } = await import("../modules/media/media.service.js");
    const mediaState = await getStatus();
    ws.send(
      JSON.stringify({
        type: "media_state",
        state: mediaState,
      }),
    );
  } catch (err) {
    logger.warn({ err }, "Failed to send initial media_state");
  }
}

export function createWebSocketServer(server: Server): WebSocketServer {
  const clients = new Set<WebSocket>();

  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    clients.add(ws);
    logger.info(`Client connected (${clients.size} total)`);

    // Send initial states (user, ui, media) — fire-and-forget
    sendInitialStates(ws).catch((err) =>
      logger.error({ err }, "sendInitialStates failed"),
    );

    ws.on("message", (data: Buffer) => {
      // Binary PCM data received from browser.
      // Since backend has no Discord client to relay to, drop it.
      if (Buffer.isBuffer(data) && data.length > 0) {
        logger.debug(
          { bytes: data.length },
          "Dropping binary PCM (no Discord client)",
        );
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

  globalThis.__broadcastFns = {
    messageCreated: (data: unknown) =>
      broadcast({ type: "message_created", data }),
    messageUpdated: (data: unknown) =>
      broadcast({ type: "message_updated", data }),
    messageDeleted: (data: unknown) =>
      broadcast({ type: "message_deleted", data }),
    attachmentUploaded: (data: unknown) =>
      broadcast({ type: "attachment_uploaded", data }),
    raw: (type: string, data: unknown) => broadcast({ type, data }),
  };

  // Cleanup on close
  wss.on("close", () => {
    clearInterval(heartbeatInterval);
    globalThis.__broadcastFns = undefined;
  });

  logger.info({ path: "/ws" }, "WebSocket server created");

  return wss;
}
