import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/node";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import { createChildLogger } from "@/shared/logger/index";
import { createHealthRouter } from "../modules/health/index.js";
import { appRouter } from "../orpc/router";
import { errorHandler } from "../shared/middlewares/index.js";

// Auth removed — dashboard is public.
// All data APIs (dashboard, messages, moderation, media, voice, recordings,
// analysis, chatbot, config, ui-state) now flow over oRPC, served on TWO
// transports sharing the /trpc path:
//   - WebSocket (browser live RPCs)  — see orpc/ws.ts
//   - HTTP POST   (server-side / RSC fetch) — handled below
// Only infra endpoints (health, prometheus metrics) remain plain HTTP.

const logger = createChildLogger("http.app");

export function createHttpApp(): Express {
  const app = express();

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  // Body parsing (still needed for any JSON POST; oRPC is WS/HTTP-based)
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logging
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api/")) {
      res.set("Cache-Control", "no-store");
    }
    res.on("finish", () => {
      if (req.originalUrl.startsWith("/.well-known/")) return;
      if (req.originalUrl === "/favicon.ico") return;
      if (res.statusCode >= 400) {
        logger.warn(
          {
            method: req.method,
            url: req.originalUrl,
            statusCode: res.statusCode,
          },
          "HTTP request failed",
        );
      }
    });
    next();
  });

  // Infra-only HTTP endpoints
  app.use("/api", createHealthRouter());

  // oRPC over HTTP (server-side / RSC fetch). The same appRouter the browser
  // reaches over the /trpc WebSocket. oRPC's node RPCHandler writes the full
  // response itself; if no procedure matched we fall through to the 404 below.
  const orpcHandler = new RPCHandler(appRouter, {
    interceptors: [onError((error) => logger.error({ error }, "oRPC error"))],
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/trpc")) {
      next();
      return;
    }
    orpcHandler
      .handle(req, res, { prefix: "/trpc", context: {} })
      .then(({ matched }) => {
        if (!matched) next();
      })
      .catch((err: unknown) => {
        logger.error({ err }, "oRPC HTTP handler failed");
        if (!res.headersSent) res.status(500).json({ error: "INTERNAL" });
      });
  });

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: "NOT_FOUND",
      message:
        "Endpoint not found — data APIs are served over /trpc (WebSocket/HTTP)",
    });
  });

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
