import "./mock-crc.js";
import "libsodium-wrappers";
import "@snazzah/davey";
import "dotenv/config";
import { initializeDiscordGateway } from "./app/bootstrap.js";
import { createChildLogger } from "@bete/shared/logger";

const logger = createChildLogger("discord-gateway");

// Initialize the Discord Gateway service
initializeDiscordGateway().catch((error: unknown) => {
  logger.error({ error }, "Failed to initialize Discord Gateway");
  process.exit(1);
});
