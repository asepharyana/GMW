import { config } from "../shared/config/index.js";
import { initializeDatabase } from "../shared/database/index.js";
import { createChildLogger } from "../shared/logger/index.js";
import { createHttpApp } from "./app.js";

const logger = createChildLogger("http.server");

export async function startHttpServer() {
  await initializeDatabase();

  const app = createHttpApp();
  const port = config.WEBSERVER_PORT;

  return new Promise<void>((resolve, reject) => {
    const server = app.listen(port, () => {
      logger.info({ port }, "HTTP server started");
      resolve();
    });

    server.on("error", (err) => {
      logger.error({ err }, "HTTP server error");
      reject(err);
    });
  });
}
