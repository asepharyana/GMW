"use client";

import { createTRPCClient, createWSClient, wsLink } from "@trpc/client";
import type { TRPCClient } from "./types";

/**
 * WebSocket URL for the tRPC data RPC endpoint (/trpc), served by the backend
 * on the same host as the page (nginx proxies it). Upgrades http→ws and
 * derives wss:// when the page is served over https.
 */
function resolveWsUrl(): string {
  if (typeof window === "undefined") return "ws://localhost/trpc";
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/trpc`;
}

/**
 * tRPC client over WebSocket (browser only). `createTRPCClient` (no router
 * generic) is an untyped client; we assert it into the loose `TRPCClient`
 * shape so `.dashboard.stats.query(...)` etc. typecheck. See ./types for why
 * the client shape is intentionally untyped.
 */
const wsClient =
  typeof window === "undefined"
    ? null
    : createWSClient({ url: resolveWsUrl() });

export const trpc: TRPCClient = wsClient
  ? (createTRPCClient({
      links: [wsLink({ client: wsClient })],
    }) as unknown as TRPCClient)
  : // SSR fallback — api/* callers are client components, never run server-side.
    (undefined as unknown as TRPCClient);
