import { createChildLogger } from "@bete/shared/logger";
import { runMigrations } from "./migrate.js";

const logger = createChildLogger("migrate-cli");

runMigrations()
  .then(() => {
    logger.info("Migrations completed");
    process.exit(0);
  })
  .catch((error: unknown) => {
    logger.error({ error }, "Migration failed");
    process.exit(1);
  });
