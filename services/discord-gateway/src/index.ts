import "./mock-crc.js";
import "libsodium-wrappers";
import "@snazzah/davey";
import "dotenv/config";
import { createChildLogger } from "@bete/shared/logger";
import { initializeDiscordGateway } from "./app/bootstrap.js";

const logger = createChildLogger("discord-gateway");

// Initialize the Discord Gateway service
initializeDiscordGateway().catch((error: unknown) => {
  logger.error({ error }, "Failed to initialize Discord Gateway");
  process.exit(1);
});
