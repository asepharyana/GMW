import { nodeHTTPRequestHandler } from "@trpc/server/adapters/node-http";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import { createChildLogger } from "@/shared/logger/index";
import { createHealthRouter } from "../modules/health/index.js";
import { errorHandler } from "../shared/middlewares/index.js";
import { appRouter } from "../trpc/routers";

// Auth removed — dashboard is public.
// All data APIs (dashboard, messages, moderation, media, voice, recordings,
// analysis, chatbot, config, ui-state) now flow over tRPC, served on TWO
// transports sharing the /trpc path:
//   - WebSocket (browser live RPCs)  — see trpc/ws.ts
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

  // Body parsing (still needed for any JSON POST; tRPC is WS-based)
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

  // tRPC over HTTP (server-side / RSC fetch). The context has no WebSocket
  // here (that's the WS transport's job); procedures don't read ctx.conn, so
  // a null conn is safe.
  // NOTE: Express 5 (path-to-regexp v8) rejects the `"/trpc/*"` wildcard route,
  // and `nodeHTTPRequestHandler` uses `opts.path` as the literal procedure
  // path (it does NOT derive it from `req.url`). So we mount a plain
  // middleware and compute the procedure path from the URL ourselves.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/trpc")) {
      next();
      return;
    }
    const procPath = req.url.replace(/^\/trpc\/?/, "").split("?")[0] || "/";
    nodeHTTPRequestHandler({
      router: appRouter,
      createContext: () => ({ conn: null }),
      req,
      res,
      path: procPath,
    }).catch((err: unknown) => {
      logger.error({ err }, "tRPC HTTP handler failed");
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
