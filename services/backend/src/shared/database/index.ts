import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { config } from "../config/index.js";
import { createChildLogger } from "@bete/shared/logger";

const logger = createChildLogger("database");

let pool: Pool | null = null;
let db: ReturnType<typeof drizzle> | null = null;

export async function initializeDatabase() {
  if (db) {
    logger.warn("Database already initialized");
    return db;
  }

  const databaseUrl =
    config.DATABASE_URL ||
    `postgresql://${config.DATABASE_USER}${config.DATABASE_PASSWORD ? `:${config.DATABASE_PASSWORD}` : ""}@${config.DATABASE_HOST}:${config.DATABASE_PORT}/${config.DATABASE_NAME}`;

  pool = new Pool({
    connectionString: databaseUrl,
  });

  pool.on("error", (err) => {
    logger.error({ err }, "Unexpected error on idle client");
  });

  try {
    const client = await pool.connect();
    client.release();
    logger.info("Database connection successful");
  } catch (err) {
    logger.error({ err }, "Failed to connect to database");
    throw err;
  }

  db = drizzle(pool);
  return db;
}

export function getDatabase() {
  if (!db) {
    throw new Error(
      "Database not initialized. Call initializeDatabase() first.",
    );
  }
  return db;
}

export function getPool() {
  if (!pool) {
    throw new Error(
      "Database not initialized. Call initializeDatabase() first.",
    );
  }
  return pool;
}

export async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
    logger.info("Database connection closed");
  }
}
