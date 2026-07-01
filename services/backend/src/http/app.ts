import cors from "cors";
import { createChildLogger } from "@bete/shared/logger";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createAdminRouter } from "../modules/admin/admin.routes.js";
import { createAnalysisRouter } from "../modules/analysis/analysis.routes.js";
import { createAuthRouter } from "../modules/auth/auth.routes.js";
import { createConfigRouter } from "../modules/config/config.routes.js";
import { createDashboardRouter } from "../modules/dashboard/dashboard.routes.js";
import { createHealthRouter } from "../modules/health/health.routes.js";
import { createMascotChatRouter } from "../modules/mascot-chat/mascot-chat.routes.js";
import { createMediaRouter } from "../modules/media/media.routes.js";
import { createMessagesRouter } from "../modules/messages/messages.routes.js";
import { createRecordingsRouter } from "../modules/recordings/recordings.routes.js";
import { createUiStateRouter } from "../modules/ui-state/ui-state.routes.js";
import { createGuildsRouter } from "../modules/voice/guilds.routes.js";
import { createVoiceRouter } from "../modules/voice/voice.routes.js";
import {
  sessionAuth,
  errorHandler,
} from "../shared/middlewares/index.js";
import { config } from "../shared/config/index.js";
import { isDashboardPublic } from "../shared/config/runtime.js";

const ADMIN_PASSWORD = config.ADMIN_PASSWORD;
const logger = createChildLogger("http.app");

// Whitelist of GET endpoints allowed in public (unauthenticated) mode.
// All other GET requests require auth even when DASHBOARD_IS_PUBLIC is true.
const PUBLIC_GET_PATHS = [
  "/api/dashboard/stats",
  "/api/dashboard/users",
  "/api/dashboard/channels",
  "/api/ui-state",
  "/api/media/status",
  "/api/mascot/chat/history",
  "/api/messages",
  "/api/analysis",
  "/api/recordings",
  "/api/voice",
];

/**
 * Dynamic auth guard — checks runtime DASHBOARD_IS_PUBLIC setting for every request.
 * In public mode: only whitelisted GET paths pass through; everything else requires auth.
 * In private mode: all routes require auth.
 */
function protectedRoute(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET" && isDashboardPublic()) {
    const matched = PUBLIC_GET_PATHS.some(
      (path) => req.path === path || req.path.startsWith(path + "/"),
    );
    if (matched) {
      return next();
    }
  }
  return sessionAuth(ADMIN_PASSWORD)(req, res, next);
}

export function createHttpApp(): Express {
  const app = express();

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  // CORS — allow known frontend origins
  // Security note: strict origin whitelist prevents unauthorized cross-origin
  // access. In production, ensure only legitimate frontend domains are listed.
  // Development: local Vite preview ports
  // Production: nginx reverse-proxy serves both on the same domain,
  //             but we whitelist them for browser preflights too.
  const allowedOrigins = [
    "http://localhost:5173",   // Vite dev server
    "http://localhost:4173",   // Vite preview server
    "http://localhost:3000",   // Vite preview (alternate)
    "http://localhost:3001",   // Backend direct (dev)
    "https://imphnen.asepharyana.my.id",
    "https://imphnen.asepharyana.tech",
    "https://imphnen.asepharyana.web.id",
  ];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (server-to-server, curl, etc.)
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
      },
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Admin-Password"],
      maxAge: 86400, // 24 hours — browser can cache preflight
    }),
  );

  // CSRF TODO: state-changing endpoints (POST, PATCH, DELETE) should
  // implement CSRF protection (e.g., double-submit cookie pattern or
  // SameSite=Strict + custom header check) before deploying to production.

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Global rate limiter — pertahanan lapisan pertama terhadap abuse
  // Endpoint login (/api/auth/login) punya rate limiter sendiri yang lebih ketat
  // TODO: The global limiter is currently applied only at /api/ prefix (line below),
  // which leaves non-/api/ paths unguarded. Consider applying a lighter limiter
  // to all paths or ensure nginx handles upstream rate limiting in production.
  const globalLimiter = rateLimit({
    windowMs: 15 * 1000, // 15 seconds
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip health checks and WebSocket upgrade requests
      if (req.path === "/api/health" || req.path === "/health") return true;
      if (req.headers.upgrade === "websocket") return true;
      return false;
    },
    message: {
      error: "TOO_MANY_REQUESTS",
      message: "Too many requests, please slow down",
    },
  });

  app.use("/api/", globalLimiter);

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

  // Open endpoints (no auth required)
  app.use("/api", createHealthRouter());
  app.use("/api", createAuthRouter());
  app.use("/api", createConfigRouter());

  // Admin endpoints — always require auth (manage settings, etc.)
  // NOTE: createAdminRouter() sudah punya sessionAuth middleware internal,
  // jadi tidak perlu middleware terpisah di sini.
  app.use("/api", createAdminRouter());

  // Protected routes — guarded by runtime DASHBOARD_IS_PUBLIC setting
  // Public mode: GET is read-only, mutations require admin password
  // Private mode: everything requires admin password
  app.use("/api/dashboard", protectedRoute);
  app.use("/api", createDashboardRouter());

  app.use("/api", protectedRoute);
  app.use("/api", createMessagesRouter());
  app.use("/api", createAnalysisRouter());
  app.use("/api", createMascotChatRouter());

  // These routers are already guarded by the protectedRoute above
  app.use("/api", createMediaRouter());
  app.use("/api", createVoiceRouter());
  app.use("/api", createRecordingsRouter());
  app.use("/api", createUiStateRouter());

  // Guilds routes — always protected (even in public mode)
  app.use("/api/guilds", sessionAuth(ADMIN_PASSWORD));
  app.use("/api/guilds", createGuildsRouter());

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: "NOT_FOUND",
      message: "Endpoint not found",
    });
  });

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
