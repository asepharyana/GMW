import { createServer, type Server } from "node:http";
import { createChildLogger } from "@/shared/logger/index";
import { config } from "../shared/config/index.js";
import { initializeDatabase } from "../shared/database/index.js";
import { createORPCWebSocketServer } from "../orpc/ws.js";
import { startRedisBridge } from "../ws/redis-bridge.js";
import { createWebSocketServer } from "../ws/server.js";
import { createHttpApp } from "./app.js";

const logger = createChildLogger("http.server");

export async function startHttpServer(): Promise<Server> {
  await initializeDatabase();

  const app = createHttpApp();
  const port = config.WEBSERVER_PORT;

  const server = createServer(app);

  // Attach WebSocket servers to the same HTTP server
  createWebSocketServer(server); // /ws — voice PCM + gateway events
  createORPCWebSocketServer(server); // /trpc — structured data RPCs

  // Start Redis pub/sub bridge to forward discord-gateway events to WS clients
  await startRedisBridge();

  return new Promise<Server>((resolve, reject) => {
    server.listen(port, () => {
      logger.info({ port }, "HTTP server started");
      resolve(server);
    });

    server.on("error", (err) => {
      logger.error({ err }, "HTTP server error");
      reject(err);
    });
  });
}
