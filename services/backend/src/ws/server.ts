import type { Server } from "node:http";
import { createChildLogger } from "@bete/shared/logger";
import { WebSocket, WebSocketServer } from "ws";
import { setBroadcastFunctions } from "./broadcast.js";

const logger = createChildLogger("ws.server");

interface BroadcastEvent {
  type: string;
  data: unknown;
  timestamp: string;
}

// Track the active WebSocket server for lifecycle management
let _wss: WebSocketServer | null = null;

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

export function closeWebSocketServer(): void {
  if (!_wss) return;
  logger.info("Closing WebSocket server");
  _wss.close(() => logger.info("WebSocket server closed"));
  _wss = null;
}

export function createWebSocketServer(server: Server): WebSocketServer {
  const clients = new Set<WebSocket>();

  const wss = new WebSocketServer({ server, path: "/ws" });
  _wss = wss;

  wss.on("connection", (ws: WebSocket) => {
    clients.add(ws);
    logger.info(`Client connected (${clients.size} total)`);

    // Send initial states (user, ui, media) — fire-and-forget
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

          if (message.type === "voice_transmit" && message.buffer) {
            // Forward PCM data to Redis for discord-gateway
            import("../shared/redis/index.js").then(
              ({ getCommandPublisher }) => {
                const publisher = getCommandPublisher();
                publisher
                  .publish(
                    "backend:voice:transmit",
                    JSON.stringify({
                      type: "pcm",
                      buffer: message.buffer,
                    }),
                  )
                  .catch((err: Error) => {
                    logger.error(
                      { err },
                      "Failed to publish voice transmit to Redis",
                    );
                  });
              },
            );
          } else if (message.type === "voice_command" && message.command) {
            // Forward voice commands to discord-gateway with payload
            import("../shared/redis/index.js").then(
              ({ getCommandPublisher }) => {
                const publisher = getCommandPublisher();
                const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
                publisher
                  .publish(
                    "backend:command",
                    JSON.stringify({
                      id: commandId,
                      type: message.command,
                      payload: message.payload ?? {},
                      replyChannel: `reply:${commandId}`,
                    }),
                  )
                  .catch((err: Error) => {
                    logger.error(
                      { err },
                      "Failed to publish voice command to Redis",
                    );
                  });
              },
            );
          }
        } catch (err) {
          logger.debug({ err }, "Failed to parse WebSocket message as JSON");
        }
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

  // Defines broadcast functions and injects them via setBroadcastFunctions
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

  function broadcastBinary(data: Buffer) {
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(data);
        } catch (err) {
          logger.error({ err }, "Failed to broadcast binary data to client");
        }
      }
    }
  }

  setBroadcastFunctions({
    messageCreated: (data: unknown) =>
      broadcast({ type: "message_created", data }),
    messageUpdated: (data: unknown) =>
      broadcast({ type: "message_updated", data }),
    messageDeleted: (data: unknown) =>
      broadcast({ type: "message_deleted", data }),
    messageAnalyzed: (data: unknown) =>
      broadcast({ type: "message_analyzed", data }),
    attachmentCreated: (data: unknown) =>
      broadcast({ type: "attachment_created", data }),
    attachmentUploaded: (data: unknown) =>
      broadcast({ type: "attachment_uploaded", data }),
    voiceRecordingStarted: (data: unknown) =>
      broadcast({ type: "voice_recording_started", data }),
    voiceRecordingStopped: (data: unknown) =>
      broadcast({ type: "voice_recording_stopped", data }),
    voiceRecordingUploaded: (data: unknown) =>
      broadcast({ type: "voice_recording_uploaded", data }),
    voicePcmData: (data: unknown) =>
      broadcast({ type: "voice_pcm_data", data }),
    voiceActiveUser: (data: unknown) =>
      broadcast({ type: "voice_active_user", data }),
    analysisQueueStatus: (data: unknown) =>
      broadcast({ type: "analysis_queue_status", data }),
    raw: (type: string, data: unknown) => broadcast({ type, data }),
    binary: broadcastBinary,
  });

  // Cleanup on close
  wss.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  logger.info({ path: "/ws" }, "WebSocket server created");

  return wss;
}
