import process from "node:process";
import { Pool } from "pg";
import { getDatabase, initializeDatabase } from "../../src/database/drizzle";

interface RunnableDatabase {
  run(sql: string): Promise<unknown>;
}

const SAFE_TEST_DATABASE_NAME = /(^|[_-])(test|testing)([_-]|$)|gmw_test/i;
const DEFAULT_TEST_SCHEMA = "gmw_test";
const SAFE_TEST_SCHEMA_NAME =
  /^[a-zA-Z_][a-zA-Z0-9_]*(test|testing)[a-zA-Z0-9_]*$/i;

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

function getTestSchemaName(): string {
  const schemaName = process.env.TEST_DATABASE_SCHEMA ?? DEFAULT_TEST_SCHEMA;
  if (!SAFE_TEST_SCHEMA_NAME.test(schemaName)) {
    throw new Error(
      `Refusing to use unsafe test schema "${schemaName}". Schema name must contain "test" and use identifier-safe characters only.`,
    );
  }
  return schemaName;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function ensureTestSchemaExists(): Promise<void> {
  assertSafeTestDatabaseUrl();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const schemaName = getTestSchemaName();

  try {
    await pool.query(
      `CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schemaName)}`,
    );
  } finally {
    await pool.end();
  }
}

async function configureTestSearchPath(): Promise<void> {
  const db = getTestDatabase();
  await db.run(
    `SET search_path TO ${quoteIdentifier(getTestSchemaName())}, public`,
  );
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
  const hasSafeSchema = Boolean(process.env.TEST_DATABASE_SCHEMA);
  if (!SAFE_TEST_DATABASE_NAME.test(databaseName) && !hasSafeSchema) {
    throw new Error(
      `Refusing to run destructive database test against non-test database "${databaseName || "unknown"}" without TEST_DATABASE_SCHEMA. Set TEST_DATABASE_SCHEMA to a safe test schema name or use a database whose name contains "test" (for example hub_test).`,
    );
  }

  if (hasSafeSchema) {
    getTestSchemaName();
  }
}

export async function initializeTestDatabase() {
  assertSafeTestDatabaseUrl();
  await ensureTestSchemaExists();
  const database = await initializeDatabase();
  await configureTestSearchPath();
  return database;
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
