import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** Cloudflare Rocket Loader breaks ES module scripts by rewriting type="module".
 *  Adding data-cfasync="false" tells Rocket Loader to skip this script. */
function cloudflareCompat(): Plugin {
  return {
    name: "cloudflare-compat",
    transformIndexHtml(html) {
      return html.replace(
        '<script type="module" crossorigin',
        '<script type="module" data-cfasync="false" crossorigin',
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), cloudflareCompat()],
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
    allowedHosts: [
      "imphnen.asepharyana.my.id",
      "imphnen.asepharyana.tech",
      "imphnen.asepharyana.web.id",
    ],
  },
});
