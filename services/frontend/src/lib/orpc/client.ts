"use client";

import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/websocket";
import PartySocket from "partysocket";
import type { ORPCClient } from "./types";

/**
 * oRPC client over WebSocket (browser only).
 *
 * oRPC's own WebSocket RPCLink takes a caller-provided socket and does NOT
 * auto-reconnect, so we back it with partysocket — a reconnecting WebSocket
 * whose `host` + `basePath: "trpc"` resolves to exactly `/trpc`, matching the
 * backend's oRPC WS mount. partysocket keeps a stable socket identity across
 * reconnects, which is what oRPC's RPCLink expects.
 *
 * The client is loosely typed (see ./types): we do NOT import the backend
 * router's type into the FE (fragile coupling). api/* wrappers assert leaf
 * results to the frontend's local types.
 */
const orpc: ORPCClient = (() => {
  if (typeof window === "undefined") {
    // SSR fallback — api/* callers are client components, never run server-side.
    return undefined as unknown as ORPCClient;
  }

  const socket = new PartySocket({
    host: window.location.host,
    basePath: "trpc",
  });

  const link = new RPCLink({
    websocket: socket as unknown as Pick<
      WebSocket,
      "addEventListener" | "readyState" | "removeEventListener" | "send"
    >,
  });
  return createORPCClient(link) as unknown as ORPCClient;
})();

export { orpc };
