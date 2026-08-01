import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient } from "pg";
import { createChildLogger } from "../logger/index.js";
import { closePool, createPoolFromConfig } from "./pool.js";

const logger = createChildLogger("database.init");

let db: ReturnType<typeof drizzle> | null = null;
let rawPool: Pool | null = null;

export interface DatabaseConfig {
  DATABASE_URL?: string;
  POSTGRES_HOST?: string;
  POSTGRES_PORT?: number;
  POSTGRES_USER?: string;
  POSTGRES_PASSWORD?: string;
  POSTGRES_DB?: string;
  POSTGRES_POOL_MIN?: number;
  POSTGRES_POOL_MAX?: number;
}

export async function initializeDatabase(
  cfg: DatabaseConfig,
  schema?: Record<string, unknown>,
) {
  if (db !== null) return db;

  const pool = cfg.DATABASE_URL
    ? createPoolFromConfig({
        url: cfg.DATABASE_URL,
        min: cfg.POSTGRES_POOL_MIN,
        max: cfg.POSTGRES_POOL_MAX,
      })
    : createPoolFromConfig({
        host: cfg.POSTGRES_HOST,
        port: cfg.POSTGRES_PORT,
        user: cfg.POSTGRES_USER,
        password: cfg.POSTGRES_PASSWORD,
        database: cfg.POSTGRES_DB,
        min: cfg.POSTGRES_POOL_MIN,
        max: cfg.POSTGRES_POOL_MAX,
      });

  rawPool = pool;
  if (schema) {
    db = drizzle(pool, { schema });
  } else {
    db = drizzle(pool);
  }

  try {
    const client = await pool.connect();
    client.release();
    logger.info("Database connection successful");
  } catch (err) {
    logger.error({ err }, "Failed to connect to database");
    throw err;
  }

  return db;
}

export function getDatabase() {
  if (db === null) {
    throw new Error(
      "Database not initialized. Call initializeDatabase() first.",
    );
  }
  return db;
}

export function getPool() {
  if (!rawPool) {
    throw new Error(
      "Database not initialized. Call initializeDatabase() first.",
    );
  }
  return rawPool;
}

export async function closeDatabase() {
  if (rawPool !== null) {
    await closePool(rawPool);
  }
  rawPool = null;
  db = null;
  logger.info("Database connection closed");
}

function convertPlaceholdersForPostgres(sql: string) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export async function executeAll(sql: string, params?: unknown[]) {
  if (!rawPool) {
    throw new Error(
      "Database not initialized. Call initializeDatabase() first.",
    );
  }
  const query = convertPlaceholdersForPostgres(sql);
  const result = await rawPool.query(query, params || []);
  return result.rows;
}

export async function executeGet(sql: string, params?: unknown[]) {
  if (!rawPool) {
    throw new Error(
      "Database not initialized. Call initializeDatabase() first.",
    );
  }
  const query = convertPlaceholdersForPostgres(sql);
  const result = await rawPool.query(query, params || []);
  return result.rows[0] ?? null;
}

export async function withDatabaseClient<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!rawPool) {
    throw new Error(
      "Database not initialized. Call initializeDatabase() first.",
    );
  }
  const client = await rawPool.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}
