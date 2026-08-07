import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // SSR — pages render on the server; realtime stays client-side via WS.
  // No static export: shared state (voice, media, moderation) is served
  // from the backend at render-time on the server.
  output: "standalone",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;