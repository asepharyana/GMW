import { createServer, type Server } from "node:http";
import { config } from "../shared/config/index.js";
import { initializeDatabase } from "../shared/database/index.js";
import { createChildLogger } from "../shared/logger/index.js";
import { createHttpApp } from "./app.js";
import { createWebSocketServer } from "../ws/server.js";

const logger = createChildLogger("http.server");

export async function startHttpServer(): Promise<Server> {
  await initializeDatabase();

  const app = createHttpApp();
  const port = config.WEBSERVER_PORT;

  const server = createServer(app);

  // Attach WebSocket server to the same HTTP server
  createWebSocketServer(server);

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
