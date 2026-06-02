import { getPool } from "../../shared/database/index.js";
import { createChildLogger } from "@bete/shared/logger";

const logger = createChildLogger("health.repository");

export class HealthRepository {
  async checkDatabaseConnection() {
    try {
      logger.debug("Running database health check");
      const pool = getPool();
      await pool.query("SELECT 1 AS result");
      logger.debug("Database health check passed");
      return { connected: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ error: message }, "Database health check failed");
      return { connected: false, error: message };
    }
  }
}

export const healthRepository = new HealthRepository();
