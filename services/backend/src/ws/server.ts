import type { Server } from "node:http";
import { BACKEND_COMMAND, BACKEND_VOICE_TRANSMIT } from "@bete/shared";
import { createChildLogger } from "@bete/shared/logger";
import { WebSocket, WebSocketServer } from "ws";
import { config } from "../shared/config/index.js";
import { setBroadcastFunctions } from "./broadcast.js";

const logger = createChildLogger("ws.server");

// Per-client sliding window rate limiter: max 30 messages per 5-second window
const RATE_LIMIT_WINDOW_MS = 5000;
const RATE_LIMIT_MAX_MSGS = 30;
const messageTimestamps = new WeakMap<WebSocket, number[]>();

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

  wss.on("connection", async (ws: WebSocket, req) => {
    // Max connection limit — prevent resource exhaustion
    const totalClients = frontendClients.size + gatewayClients.size;
    const MAX_CONNECTIONS = 100;
    if (totalClients >= MAX_CONNECTIONS) {
      logger.warn({ totalClients }, "Max connections reached, rejecting new client");
      ws.close(4003, "Server at capacity");
      return;
    }

    // Gateway uses token in query string (internal-only connection, not in logs)
    // Frontend uses auth message pattern to avoid token exposure in access logs
    const rawUrl = req.url ?? "/";
    let isGateway = false;
    let queryToken: string | null = null;

    try {
      const url = new URL(rawUrl, "http://localhost");
      queryToken = url.searchParams.get("token");
      isGateway =
        queryToken !== null &&
        config.BACKEND_WS_TOKEN !== "" &&
        queryToken === config.BACKEND_WS_TOKEN;
    } catch {
      // Malformed URL — treat as frontend
    }

    if (isGateway) {
      gatewayClients.add(ws);
      logger.info("Discord gateway WebSocket client authenticated");
      // Gateway only sends binary PCM — forward to frontend clients
      ws.on("message", (data: Buffer) => {
        if (Buffer.isBuffer(data)) {
          broadcastBinaryToFrontend(data);
        }
      });
      ws.on("close", () => {
        gatewayClients.delete(ws);
        logger.info("Discord gateway WebSocket disconnected");
      });
      ws.on("error", (err: Error) => {
        logger.error({ err }, "Gateway WebSocket error");
        gatewayClients.delete(ws);
      });
      return;
    }

    // ── Frontend client: auth message pattern ──────────────────────────
    // Token is NEVER accepted in query string for frontend connections.
    // Frontend must send { type: "auth", token: "..." } as first message.
    // ────────────────────────────────────────────────────────────────────

    // Origin check for frontend WebSocket connections
    const origin = req.headers.origin;
    if (origin) {
      const allowedWsOrigins = [
        "http://localhost:5173",
        "http://localhost:4173",
        "http://localhost:3000",
        "http://localhost:3001",
        "https://imphnen.asepharyana.my.id",
        "https://imphnen.asepharyana.tech",
        "https://imphnen.asepharyana.web.id",
      ];
      if (!allowedWsOrigins.includes(origin)) {
        logger.warn({ origin }, "WebSocket connection rejected: origin not allowed");
        ws.close(4002, "Origin not allowed");
        return;
      }
    }

    let authenticated = false;
    let authTimer: ReturnType<typeof setTimeout> | null = null;

    const { isDashboardPublic } = await import("../shared/config/runtime.js");
    const isPublic = isDashboardPublic();

    if (!isPublic) {
      authTimer = setTimeout(() => {
        if (!authenticated) {
          ws.close(4001, "Authentication timeout");
          logger.warn("Frontend WS connection timed out waiting for auth");
        }
      }, 5000);
    } else {
      authenticated = true;
      frontendClients.add(ws);
    }

    function processFrontendMessage(data: Buffer): void {
      // Validate auth before processing messages
      if (!authenticated) {
        try {
          const msg = JSON.parse(data.toString());
          if (
            msg.type !== "auth" ||
            typeof msg.token !== "string"
          ) {
            return; // wait for valid auth
          }

          if (!isPublic) {
            const { verifySessionToken } = require("../shared/middlewares/index.js");
            verifySessionToken(msg.token, config.ADMIN_PASSWORD);
          }

          authenticated = true;
          if (authTimer) {
            clearTimeout(authTimer);
            authTimer = null;
          }
          frontendClients.add(ws);
          logger.info(`Frontend client authenticated (${frontendClients.size} total)`);
          sendInitialStates(ws).catch((err) =>
            logger.error({ err }, "sendInitialStates failed"),
          );
          return;
        } catch {
          return; // invalid auth, wait for next message
        }
      }

      // Per-client rate limiting — authenticated-only, max 30 msg / 5s sliding window
      if (authenticated) {
        const now = Date.now();
        let timestamps = messageTimestamps.get(ws);
        if (!timestamps) {
          timestamps = [];
          messageTimestamps.set(ws, timestamps);
        }
        // Prune timestamps outside the window
        const cutoff = now - RATE_LIMIT_WINDOW_MS;
        while (timestamps.length > 0 && timestamps[0]! < cutoff) {
          timestamps.shift();
        }
        if (timestamps.length >= RATE_LIMIT_MAX_MSGS) {
          logger.warn("Frontend client rate-limited (closing)");
          ws.close(4006, "Rate limit exceeded");
          return;
        }
        timestamps.push(now);
      }

      // Handle voice transmit binary
      if (
        Buffer.isBuffer(data) &&
        data.length > 4 &&
        data[0] === 0x50 && // 'P'
        data[1] === 0x43 && // 'C'
        data[2] === 0x4d && // 'M'
        data[3] === 0x00    // '\0'
      ) {
        const pcmBuffer = data.subarray(4);
        const base64 = pcmBuffer.toString("base64");
        import("../shared/redis/index.js").then(
          ({ getCommandPublisher }) => {
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
          },
        );
        return;
      }

      // Handle JSON messages from browser
      if (
        typeof data === "string" ||
        (Buffer.isBuffer(data) && data.length > 0 && data[0] === 0x7b)
      ) {
        try {
          const message = JSON.parse(data.toString());
          handleFrontendJsonMessage(message);
        } catch (err) {
          logger.debug({ err }, "Failed to parse WebSocket message as JSON");
        }
      }
    }

    function handleFrontendJsonMessage(message: Record<string, unknown>): void {
      if (message.type === "voice_transmit" && message.buffer) {
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
    }

    ws.on("message", (data: Buffer) => processFrontendMessage(data));

    ws.on("close", () => {
      if (authTimer) clearTimeout(authTimer);
      frontendClients.delete(ws);
      logger.info(
        `Frontend client disconnected (${frontendClients.size} total)`,
      );
    });

    ws.on("error", (err: Error) => {
      logger.error({ err }, "Frontend WebSocket error");
      if (authTimer) clearTimeout(authTimer);
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

  // Forward gateway binary to frontend clients (no loopback to gateway)
  function broadcastBinaryToFrontend(data: Buffer) {
    for (const client of frontendClients) {
      if (client.readyState === WebSocket.OPEN) {
        // Backpressure check: skip slow clients to prevent OOM
        if (client.bufferedAmount > 64 * 1024) continue;
        try {
          client.send(data);
        } catch (err) {
          logger.error(
            { err },
            "Failed to send binary to frontend client",
          );
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
        // Backpressure check: skip slow clients to prevent OOM
        if (client.bufferedAmount > 64 * 1024) continue;
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
        // Backpressure check: skip slow clients to prevent OOM
        if (client.bufferedAmount > 64 * 1024) continue;
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
