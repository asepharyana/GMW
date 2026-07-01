import { defineConfig } from "astro/config";
import react from "@astrojs/react";

// ─────────────────────────────────────────────────────────────
// BETE – Astro Configuration
// Tailwind v4 ditangani via PostCSS (postcss.config.js)
// ─────────────────────────────────────────────────────────────
export default defineConfig({
  integrations: [react()],

  output: "static",

  // Dev server
  server: {
    host: "0.0.0.0",
    port: 3000,
  },

  // Preview
  preview: {
    host: true,
    port: 3000,
    allowedHosts: [
      "imphnen.asepharyana.my.id",
      "imphnen.asepharyana.tech",
      "imphnen.asepharyana.web.id",
    ],
  },

  // Vite config
  vite: {
    server: {
      allowedHosts: [
        "imphnen.asepharyana.my.id",
        "imphnen.asepharyana.tech",
        "imphnen.asepharyana.web.id",
      ],
      watch: {
        // Penting: Astro punya public/ dir sendiri, jangan bentrok
        ignored: ["!**/node_modules/**"],
      },
    },
    // PostCSS otomatis terdeteksi dari root project
  },
});
