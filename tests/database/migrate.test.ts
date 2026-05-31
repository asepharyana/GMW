import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const migrateSpy = vi.fn();
const initializeDatabaseSpy = vi.fn();
const closeDatabaseSpy = vi.fn();
const withDatabaseClientSpy = vi.fn();
const lockQuerySpy = vi.fn();
const unlockQuerySpy = vi.fn();
const drizzleSpy = vi.fn();

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: drizzleSpy,
}));

vi.mock("drizzle-orm/node-postgres/migrator", () => ({
  migrate: migrateSpy,
}));

vi.mock("../../src/config", () => ({
  config: {
    AUTO_MIGRATE_ON_STARTUP: true,
  },
}));

vi.mock("../../src/database/drizzle", () => ({
  initializeDatabase: initializeDatabaseSpy,
  closeDatabase: closeDatabaseSpy,
  withDatabaseClient: withDatabaseClientSpy,
}));

describe("runMigrations", () => {
  beforeEach(() => {
    migrateSpy.mockResolvedValue(undefined);
    initializeDatabaseSpy.mockResolvedValue({} as never);
    closeDatabaseSpy.mockResolvedValue(undefined);
    drizzleSpy.mockReturnValue({} as never);
    withDatabaseClientSpy.mockImplementation(
      async (callback: () => Promise<unknown>) =>
        callback({
          query: vi.fn().mockImplementation((sql: string) => {
            if (sql.includes("pg_advisory_lock")) {
              return lockQuerySpy(sql);
            }
            if (sql.includes("pg_advisory_unlock")) {
              return unlockQuerySpy(sql);
            }

            return Promise.resolve({});
          }),
        } as never),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("exports the PostgreSQL migration runner", async () => {
    const { runMigrations } = await import("../../src/database/migrate");

    expect(runMigrations).toBeTypeOf("function");
  });

  it("uses a session lock around the migration batch", async () => {
    const { runMigrations } = await import("../../src/database/migrate");
    await runMigrations();

    expect(initializeDatabaseSpy).toHaveBeenCalledTimes(1);
    expect(withDatabaseClientSpy).toHaveBeenCalledTimes(1);
    expect(migrateSpy).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ migrationsFolder: "./drizzle/migrations" }),
    );
    expect(lockQuerySpy).toHaveBeenCalledWith(
      "SELECT pg_advisory_lock($1, $2)",
    );
    expect(unlockQuerySpy).toHaveBeenCalledWith(
      "SELECT pg_advisory_unlock($1, $2)",
    );
    expect(closeDatabaseSpy).toHaveBeenCalledTimes(1);
  });
});
