import { createChildLogger } from "../../shared/logger/index.js";

const logger = createChildLogger("health.repository");

export class HealthRepository {
  async checkDatabaseConnection() {
    try {
      // TODO: Implement actual health check
      return { connected: true };
    } catch (err) {
      logger.error({ err }, "Database health check failed");
      return { connected: false };
    }
  }
}

export const healthRepository = new HealthRepository();
