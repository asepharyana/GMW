import process from "node:process";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertSafeTestDatabaseUrl } from "./helpers/testDatabase";

const originalEnv = process.env;

describe("Drizzle ORM Database", () => {
  let drizzle: typeof import("../src/database/drizzle");
  let logger: ReturnType<typeof import("../src/logger").createChildLogger>;

  beforeAll(async () => {
    // Set up environment for config loading
    process.env = {
      ...originalEnv,
      DISCORD_TOKEN: "test-token",
      NODE_ENV: "test",
    };
    if (originalEnv.TEST_DATABASE_URL) {
      process.env.DATABASE_URL = originalEnv.TEST_DATABASE_URL;
    }
    assertSafeTestDatabaseUrl();

    // Reset modules to pick up new environment
    vi.resetModules();

    // Import after environment is set
    await import("../src/config");
    const drizzleModule = await import("../src/database/drizzle");
    const loggerModule = await import("../src/logger");

    drizzle = drizzleModule;
    logger = loggerModule.createChildLogger("database.test");

    logger.info("Testing PostgreSQL database initialization");
  });

  afterAll(async () => {
    try {
      await drizzle.closeDatabase();
    } catch (error) {
      if (logger) {
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          "Error closing database in afterAll",
        );
      }
    }
    process.env = originalEnv;
  });

  it("should initialize database connection", async () => {
    const db = await drizzle.initializeDatabase();

    expect(db).toBeDefined();
    expect(db).toHaveProperty("query");
    expect(db).toHaveProperty("select");
  });

  it("should return same instance on subsequent calls", async () => {
    const db1 = await drizzle.initializeDatabase();
    const db2 = await drizzle.initializeDatabase();

    expect(db1).toBe(db2);
  });

  it("should get database instance", async () => {
    await drizzle.initializeDatabase();
    const db = drizzle.getDatabase();

    expect(db).toBeDefined();
    expect(db).toHaveProperty("query");
  });

  it("should throw error if database not initialized", async () => {
    // Reset the database state
    vi.resetModules();

    const drizzleModule = await import("../src/database/drizzle");

    expect(() => {
      drizzleModule.getDatabase();
    }).toThrow("Database not initialized");
  });

  it("should close database connection", async () => {
    await drizzle.initializeDatabase();
    await drizzle.closeDatabase();

    expect(() => {
      drizzle.getDatabase();
    }).toThrow("Database not initialized");
  });
});
