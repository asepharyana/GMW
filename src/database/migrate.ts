import "dotenv/config";
import { migrate as migratePostgres } from "drizzle-orm/node-postgres/migrator";
import { createChildLogger } from "../logger.js";
import { closeDatabase, initializeDatabase } from "./drizzle.js";

const logger = createChildLogger("migrate");

export async function runMigrations(): Promise<void> {
  try {
    logger.info("Starting PostgreSQL migrations");
    const db = (await initializeDatabase()) as Parameters<
      typeof migratePostgres
    >[0];

    try {
      await migratePostgres(db, { migrationsFolder: "./drizzle/migrations" });
    } finally {
      await closeDatabase();
    }

    logger.info("PostgreSQL migrations completed successfully");
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Migration failed",
    );
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => {
      logger.info("Migrations completed");
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ error }, "Migration failed");
      process.exit(1);
    });
}
