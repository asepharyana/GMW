import { initTRPC } from "@trpc/server";
import type { WebSocket } from "ws";
import { createChildLogger } from "@/shared/logger/index";

const logger = createChildLogger("trpc");

/**
 * tRPC context. The WebSocket transport enriches each request with the raw
 * socket so procedures can, if needed, inspect connection metadata. The
 * dashboard is public (no auth), mirroring the previous REST layer.
 */
export interface TRPCContext {
  conn: WebSocket | null;
}

const t = initTRPC.context<TRPCContext>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Surface a stable code + message for client-side handling.
        code: error.code,
        stack: undefined,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Re-export so routers can import z from one place if desired.
export { z } from "zod";
export { logger };
