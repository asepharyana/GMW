import process from "node:process";
import {
  getDatabase,
  initializeDatabase,
} from "../../src/database/drizzle";

interface RunnableDatabase {
  run(sql: string): Promise<unknown>;
}

const SAFE_TEST_DATABASE_NAME = /(^|[_-])(test|testing)([_-]|$)|gmw_test/i;

function getDatabaseNameFromUrl(databaseUrl: string): string {
  try {
    const parsed = new URL(databaseUrl);
    return parsed.pathname.replace(/^\//, "");
  } catch {
    return "";
  }
}

function getConfiguredDatabaseName(): string {
  if (process.env.DATABASE_URL) {
    return getDatabaseNameFromUrl(process.env.DATABASE_URL);
  }
  return process.env.POSTGRES_DB ?? "";
}

export function assertSafeTestDatabaseUrl(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      `Refusing to run destructive database test outside NODE_ENV=test (got ${process.env.NODE_ENV ?? "unset"})`,
    );
  }

  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  }

  const databaseName = getConfiguredDatabaseName();
  if (!SAFE_TEST_DATABASE_NAME.test(databaseName)) {
    throw new Error(
      `Refusing to run destructive database test against non-test database "${databaseName || "unknown"}". Set TEST_DATABASE_URL or DATABASE_URL to a database whose name contains "test" (for example hub_test).`,
    );
  }
}

export async function initializeTestDatabase() {
  assertSafeTestDatabaseUrl();
  return initializeDatabase();
}

export function getTestDatabase(): RunnableDatabase {
  assertSafeTestDatabaseUrl();
  return getDatabase() as unknown as RunnableDatabase;
}

export async function clearTestTables(...tableNames: string[]): Promise<void> {
  assertSafeTestDatabaseUrl();
  const db = getTestDatabase();
  for (const tableName of tableNames) {
    await db.run(`DELETE FROM "${tableName}"`);
  }
}
