import {
  closeDatabase as sharedCloseDb,
  executeAll as sharedExecAll,
  executeGet as sharedExecGet,
  getDatabase as sharedGetDb,
  initializeDatabase as sharedInit,
  withDatabaseClient as sharedWithClient,
} from "@bete/shared/database/init";
import { createChildLogger } from "@bete/shared/logger";
import { config } from "../../shared/config/config.js";
import * as schema from "./schema.js";

const logger = createChildLogger("drizzle");

const dbConfig = {
  DATABASE_URL: config.DATABASE_URL,
  POSTGRES_HOST: config.POSTGRES_HOST,
  POSTGRES_PORT: config.POSTGRES_PORT,
  POSTGRES_USER: config.POSTGRES_USER,
  POSTGRES_PASSWORD: config.POSTGRES_PASSWORD,
  POSTGRES_DB: config.POSTGRES_DB,
  POSTGRES_POOL_MIN: config.POSTGRES_POOL_MIN,
  POSTGRES_POOL_MAX: config.POSTGRES_POOL_MAX,
};

export async function initializeDatabase() {
  logger.info("Initializing database");
  return sharedInit(dbConfig, schema);
}

export function getDatabase() {
  return sharedGetDb();
}

export const closeDatabase = sharedCloseDb;
export const executeAll = sharedExecAll;
export const executeGet = sharedExecGet;
export const withDatabaseClient = sharedWithClient;
