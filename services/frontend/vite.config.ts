import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      checks: {
        pluginTimings: false,
      },
    },
  },
  server: {
    middlewareMode: false,
  },
  preview: {
    port: 3000,
    host: true,
    allowedHosts: ["imphnen.asepharyana.my.id", "imphnen.asepharyana.tech", "imphnen.asepharyana.web.id"],
  },
});
