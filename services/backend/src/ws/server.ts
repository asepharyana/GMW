import type { Server } from "node:http";
import { BACKEND_COMMAND, BACKEND_VOICE_TRANSMIT } from "@bete/shared";
import { createChildLogger } from "@bete/shared/logger";
import { WebSocket, WebSocketServer } from "ws";
import { config } from "../shared/config/index.js";
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
  // Separate tracking: gateway sends PCM → forwarded to frontend only
  const frontendClients = new Set<WebSocket>();
  const gatewayClients = new Set<WebSocket>();

  const wss = new WebSocketServer({ server, path: "/ws" });
  _wss = wss;

  wss.on("connection", (ws: WebSocket, req) => {
    // Parse auth token from query string
    const rawUrl = req.url ?? "/";
    let isGateway = false;

    try {
      const url = new URL(rawUrl, "http://localhost");
      const token = url.searchParams.get("token");
      isGateway =
        token !== null &&
        config.BACKEND_WS_TOKEN !== "" &&
        token === config.BACKEND_WS_TOKEN;
    } catch {
      // Malformed URL — treat as frontend
    }

    if (isGateway) {
      gatewayClients.add(ws);
      logger.info("Discord gateway WebSocket client authenticated");
      // Gateway doesn't need initial states
    } else {
      frontendClients.add(ws);
      logger.info(`Frontend client connected (${frontendClients.size} total)`);
      // Send initial states (user, ui, media) — fire-and-forget
      sendInitialStates(ws).catch((err) =>
        logger.error({ err }, "sendInitialStates failed"),
      );
    }

    ws.on("message", (data: Buffer) => {
      // Gateway PCM forward — broadcast raw binary to frontend clients only
      if (isGateway && Buffer.isBuffer(data)) {
        broadcastBinaryToFrontend(data);
        return;
      }

      // Handle binary PCM from browser (FE→Discord transmit)
      // Format: 4-byte magic "PCM\0" + raw PCM Int16 LE
      if (
        Buffer.isBuffer(data) &&
        data.length > 4 &&
        data[0] === 0x50 && // 'P'
        data[1] === 0x43 && // 'C'
        data[2] === 0x4d && // 'M'
        data[3] === 0x00 // '\0'
      ) {
        const pcmBuffer = data.subarray(4);
        const base64 = pcmBuffer.toString("base64");
        import("../shared/redis/index.js").then(({ getCommandPublisher }) => {
          const publisher = getCommandPublisher();
          publisher
            .publish(
              BACKEND_VOICE_TRANSMIT,
              JSON.stringify({
                type: "pcm",
                buffer: base64,
              }),
            )
            .catch((err: Error) => {
              logger.error(
                { err },
                "Failed to publish voice transmit to Redis",
              );
            });
        });
        return;
      }

      // Handle JSON messages from browser
      if (
        typeof data === "string" ||
        (Buffer.isBuffer(data) && data.length > 0 && data[0] === 0x7b)
      ) {
        try {
          const message = JSON.parse(data.toString());

          if (message.type === "voice_transmit" && message.buffer) {
            // Legacy: Forward PCM data to Redis for discord-gateway
            import("../shared/redis/index.js").then(
              ({ getCommandPublisher }) => {
                const publisher = getCommandPublisher();
                publisher
                  .publish(
                    BACKEND_VOICE_TRANSMIT,
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
                    BACKEND_COMMAND,
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
      if (isGateway) {
        gatewayClients.delete(ws);
        logger.info("Discord gateway WebSocket disconnected");
      } else {
        frontendClients.delete(ws);
        logger.info(
          `Frontend client disconnected (${frontendClients.size} total)`,
        );
      }
    });

    ws.on("error", (err: Error) => {
      logger.error({ err }, "WebSocket client error");
      if (isGateway) {
        gatewayClients.delete(ws);
      } else {
        frontendClients.delete(ws);
      }
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

  // Forward gateway binary to frontend clients (no loopback to gateway)
  function broadcastBinaryToFrontend(data: Buffer) {
    for (const client of frontendClients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(data);
        } catch (err) {
          logger.error({ err }, "Failed to send binary to frontend client");
        }
      }
    }
  }

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
