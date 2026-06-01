import { createChildLogger } from "../../shared/logger/index.js";
import { healthRepository } from "./health.repository.js";

const logger = createChildLogger("health.service");

export class HealthService {
  async getHealth(verbose = false) {
    const dbStatus = await healthRepository.checkDatabaseConnection();

    return {
      status: dbStatus.connected ? "healthy" : "degraded",
      timestamp: Date.now(),
      ...(verbose && {
        database: dbStatus,
      }),
    };
  }
}

export const healthService = new HealthService();
