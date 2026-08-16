import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { config } from "../shared/config/index.js";
import { BACKEND_COMMAND, BACKEND_VOICE_TRANSMIT } from "../shared/index.js";
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
  buffer?: string;
  command?: string;
  payload?: Record<string, unknown>;
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

  // Send initial live-voice snapshot (shared authoritative state — a browser
  // joining mid-call sees the same speakers as everyone else, not an empty DB).
  try {
    const { getActiveSpeakers } = await import(
      "../modules/voice/live-speaker.js"
    );
    ws.send(
      JSON.stringify({
        type: "voice_state",
        state: { activeSpeakers: getActiveSpeakers() },
      }),
    );
  } catch (err) {
    logger.warn({ err }, "Failed to send initial voice_state");
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

  jsonHandlers.set("voice_transmit", async (_ws, message) => {
    if (!message.buffer) return;
    const { getCommandPublisher } = await import("../shared/redis/index.js");
    const publisher = getCommandPublisher();
    await publisher.publish(
      BACKEND_VOICE_TRANSMIT,
      JSON.stringify({ type: "pcm", buffer: message.buffer }),
    );
  });

  jsonHandlers.set("voice_command", async (_ws, message) => {
    if (!message.command) return;
    const { getCommandPublisher } = await import("../shared/redis/index.js");
    const publisher = getCommandPublisher();
    const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await publisher.publish(
      BACKEND_COMMAND,
      JSON.stringify({
        id: commandId,
        type: message.command,
        payload: message.payload ?? {},
        replyChannel: `reply:${commandId}`,
      }),
    );
  });

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
        broadcastBinary(data);
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
