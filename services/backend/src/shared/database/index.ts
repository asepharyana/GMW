import {
  closeDatabase as sharedCloseDb,
  getDatabase as sharedGetDb,
  getPool as sharedGetPool,
  initializeDatabase as sharedInit,
} from "@/shared/database/init";
import { createChildLogger } from "@/shared/logger/index";
import { config } from "../config/index.js";

const logger = createChildLogger("database");

const dbConfig = {
  DATABASE_URL: config.DATABASE_URL,
  POSTGRES_HOST: config.POSTGRES_HOST as string | undefined,
  POSTGRES_PORT: config.POSTGRES_PORT,
  POSTGRES_USER: config.POSTGRES_USER as string | undefined,
  POSTGRES_PASSWORD: config.POSTGRES_PASSWORD as string | undefined,
  POSTGRES_DB: config.POSTGRES_DB as string | undefined,
  POSTGRES_POOL_MIN: config.POSTGRES_POOL_MIN,
  POSTGRES_POOL_MAX: config.POSTGRES_POOL_MAX,
};

export async function initializeDatabase() {
  logger.info("Initializing database");
  return sharedInit(dbConfig);
}

export function getDatabase() {
  return sharedGetDb();
}

export function getPool() {
  return sharedGetPool();
}

export async function closeDatabase() {
  logger.info("Closing database");
  return sharedCloseDb();
}
