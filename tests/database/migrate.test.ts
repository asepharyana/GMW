import { describe, expect, it } from "vitest";
import { runMigrations } from "../../src/database/migrate";

describe("runMigrations", () => {
  it("exports the PostgreSQL migration runner", () => {
    expect(runMigrations).toBeTypeOf("function");
  });
});
