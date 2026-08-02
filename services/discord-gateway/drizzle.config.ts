import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/shared/database/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ||
      "postgresql://asephs:***@100.121.180.82:6432/dcbot",
  },
});
