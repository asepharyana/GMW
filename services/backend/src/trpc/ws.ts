import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { WebSocketServer } from "ws";
import { createChildLogger } from "@/shared/logger/index";
import { appRouter } from "./routers";

const logger = createChildLogger("trpc.ws");

/**
 * Attach the tRPC WebSocket handler to the shared HTTP server, on a path
 * SEPARATE from the voice/binary WebSocket (`/ws`). All structured data RPCs
 * (dashboard, messages, moderation, media, voice control, recordings,
 * analysis, chatbot, config, ui-state) flow over this `/trpc` socket; the
 * `/ws` socket is left untouched for Discord PCM audio + gateway events.
 *
 * We use `noServer` + a manual `upgrade` router (instead of
 * `new WebSocketServer({ server, path: "/trpc" })`) because two `ws` servers
 * mounted with the `server` option on the SAME http.Server both register
 * `upgrade` listeners, and `ws`'s path-guarded listener can reject (400) the
 * other server's path. Routing the upgrade ourselves by URL keeps `/trpc`
 * and `/ws` fully isolated.
 */
export function createTRPCWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

  applyWSSHandler({
    wss,
    prefix: "/trpc",
    router: appRouter,
    createContext: (opts) => ({ conn: opts.res }),
    keepAlive: { enabled: true, pingMs: 30_000, pongWaitMs: 10_000 },
    onError: (err) => {
      logger.error({ err }, "tRPC WS error");
    },
  });

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!req.url?.startsWith("/trpc")) return; // let the /ws server handle it
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  logger.info({ path: "/trpc" }, "tRPC WebSocket server attached");
  return wss;
}
