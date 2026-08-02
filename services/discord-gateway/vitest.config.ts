import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Resolves the "@/*" tsconfig path alias so vitest can import src modules
// (the pre-existing test suite was broken without this).
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Loaded before module imports — satisfies the config singleton
    // (DISCORD_TOKEN required) and DB-agnostic pure-function tests.
    env: {
      DISCORD_TOKEN: "test-discord-token",
      DATABASE_URL: "postgres://localhost:6432/test",
      AI_ANALYSIS_ENABLED: "true",
      AI_LLM_API_KEY: "sk-test",
    },
  },
});
