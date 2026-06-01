import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { Pool } from "pg";
import { config } from "../../shared/config/config.js";
import { createChildLogger } from "../../shared/logger/logger.js";
import * as schema from "./schema.js";

const logger = createChildLogger("drizzle");

let db: ReturnType<typeof drizzlePostgres> | null = null;
let rawPool: Pool | null = null;

/**
 * Initialize the PostgreSQL database connection.
 */
export async function initializeDatabase() {
  if (db !== null) {
    return db;
  }

  let pool: Pool;

  if (config.DATABASE_URL) {
    pool = new Pool({
      connectionString: config.DATABASE_URL,
      min: config.POSTGRES_POOL_MIN,
      max: config.POSTGRES_POOL_MAX,
    });
  } else {
    pool = new Pool({
      host: config.POSTGRES_HOST,
      port: config.POSTGRES_PORT,
      user: config.POSTGRES_USER,
      password: config.POSTGRES_PASSWORD,
      database: config.POSTGRES_DB,
      min: config.POSTGRES_POOL_MIN,
      max: config.POSTGRES_POOL_MAX,
    });
  }

  rawPool = pool;
  db = drizzlePostgres(pool, { schema });

  try {
    (db as { run?: (sql: string) => Promise<unknown> }).run = (sql: string) =>
      pool.query(sql);
  } catch {
    // ignore
  }

  logger.info("PostgreSQL database initialized");
  return db;
}

/**
 * Get the initialized database instance.
 * Throws if database has not been initialized.
 */
export function getDatabase() {
  if (db === null) {
    throw new Error(
      "Database not initialized. Call initializeDatabase() first.",
    );
  }
  return db;
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

/**
 * Run a function with a dedicated PostgreSQL client from the shared pool.
 * Use this for session-scoped operations such as advisory locks.
 */
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

/**
 * Close the PostgreSQL connection pool.
 */
export async function closeDatabase() {
  if (rawPool !== null) {
    await rawPool.end();
  }

  rawPool = null;
  db = null;
  logger.info("PostgreSQL database closed");
}
