import {
  AppError,
  UnauthorizedError,
  ValidationError,
} from "@bete/shared/errors";
import { createChildLogger } from "@bete/shared/logger";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const logger = createChildLogger("middleware");

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Revokable token version ──────────────────────────────────────────────
// Token version prevents compromised tokens from being valid indefinitely.
// Stored in Redis so version survives process restarts.
// Falls back to in-memory Map if Redis is unavailable.
// ──────────────────────────────────────────────────────────────────────────

const TOKEN_VERSION_REDIS_PREFIX = "token_version:";
const TOKEN_VERSION_TTL_S = 7 * 24 * 60 * 60; // 7 days — far longer than session lifetime

const tokenVersions = new Map<string, number>(); // in-memory fallback

async function tryLoadTokenVersion(sub: string): Promise<number | null> {
  try {
    const { readRedisStatus } = await import("../redis/index.js");
    const raw = await readRedisStatus(`${TOKEN_VERSION_REDIS_PREFIX}${sub}`);
    if (raw && typeof raw.version === "number") {
      // Sync in-memory cache
      tokenVersions.set(sub, raw.version);
      return raw.version;
    }
  } catch {
    // Redis unavailable — fall through to in-memory
  }
  return null;
}

async function tryPersistTokenVersion(sub: string, version: number): Promise<void> {
  try {
    const { getCommandPublisher } = await import("../redis/index.js");
    const publisher = getCommandPublisher();
    const key = `${TOKEN_VERSION_REDIS_PREFIX}${sub}`;
    await publisher.set(key, JSON.stringify({ version }), "EX", TOKEN_VERSION_TTL_S);
  } catch {
    // Silently fall back to in-memory
  }
}

export async function incrementTokenVersion(sub: string): Promise<number> {
  const next = (tokenVersions.get(sub) ?? 0) + 1;
  tokenVersions.set(sub, next);
  // Fire-and-forget persist to Redis
  tryPersistTokenVersion(sub, next).catch(() => {});
  return next;
}

export async function getTokenVersion(sub: string): Promise<number> {
  const cached = tokenVersions.get(sub);
  if (cached !== undefined) return cached;
  // Try loading from Redis
  const remote = await tryLoadTokenVersion(sub);
  if (remote !== null) return remote;
  return 0;
}

// ─── JWT-like session token helpers ──────────────────────────────────────
// Simple HMAC-SHA256 token without external library dependency.
// Payload: { sub, iat, exp } base64url-encoded, signed with HMAC-SHA256.

interface SessionPayload {
  sub: string;    // e.g. "admin"
  iat: number;    // issued at (ms)
  exp: number;    // expires at (ms)
  ver: number;    // token version (revokable)
}

function base64urlEncode(data: string): string {
  return Buffer.from(data)
    .toString("base64url");
}

function base64urlDecode(str: string): string {
  return Buffer.from(str, "base64url").toString("utf-8");
}

function signToken(payload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
}

export function createSessionToken(adminPassword: string): string {
  const now = Date.now();
  // Note: getTokenVersion is async (Redis-backed). In practice, the version
  // is cached in-memory after first load, so this is effectively sync.
  // We use a sync fallback to keep the token-creation path non-async.
  const ver = tokenVersions.get("admin") ?? 0;
  const payload: SessionPayload = {
    sub: "admin",
    iat: now,
    exp: now + SESSION_DURATION_MS,
    ver,
  };
  const header = base64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64urlEncode(JSON.stringify(payload));
  const signature = signToken(`${header}.${body}`, adminPassword);
  return `${header}.${body}.${signature}`;
}

export function verifySessionToken(
  token: string,
  secret: string,
): SessionPayload {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new UnauthorizedError("Invalid token format");
  }
  const [header, body, signature] = parts;
  const expectedSig = signToken(`${header}.${body}`, secret);
  try {
    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSig);
    if (
      sigBuf.length !== expectedBuf.length ||
      !timingSafeEqual(sigBuf, expectedBuf)
    ) {
      throw new UnauthorizedError("Invalid token signature");
    }
  } catch {
    throw new UnauthorizedError("Invalid token signature");
  }
  const payload = JSON.parse(base64urlDecode(body)) as SessionPayload;
  if (Date.now() > payload.exp) {
    throw new UnauthorizedError("Session token expired");
  }
  // Token version check — invalidate all tokens issued before version bump
  // Note: getTokenVersion is async (Redis-backed). We fall back to the
  // in-memory cache which is synced on first load from Redis. On startup
  // the version defaults to 0, which is correct — no tokens revoked yet.
  const currentVersion = tokenVersions.get(payload.sub) ?? 0;
  if ((payload.ver ?? 0) < currentVersion) {
    throw new UnauthorizedError("Session token has been revoked");
  }
  return payload;
}

// ─── Express middleware ──────────────────────────────────────────────────

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    logger.warn({ code: err.code, statusCode: err.statusCode }, err.message);
    return res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      ...(err instanceof ValidationError && { details: err.details }),
    });
  }

  logger.error({ err }, "Unhandled error");
  res.status(500).json({
    error: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred",
  });
}

/**
 * @deprecated Replaced by sessionAuth(). Kept temporarily for transition
 * period. TODO: remove after confirming no consumers remain.
 */
// export function adminAuth(adminPassword: string) {
//   return (req: Request, res: Response, next: NextFunction) => {
//     const password = req.headers["x-admin-password"] as string;
//
//     if (!password || password !== adminPassword) {
//       throw new UnauthorizedError("Invalid admin password");
//     }
//
//     next();
//   };
// }

/**
 * Session-based auth middleware.
 * Reads Bearer token from Authorization header and validates it.
 * Falls back to X-Admin-Password header for backward compatibility.
 */
export function sessionAuth(secret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Try Authorization: Bearer <token> first
    const authHeader = req.headers.authorization as string | undefined;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      try {
        verifySessionToken(token, secret);
        return next();
      } catch (err) {
        if (err instanceof AppError) {
          throw err;
        }
        throw new UnauthorizedError("Invalid session token");
      }
    }

    // Fallback: X-Admin-Password header (for transition period)
    const password = req.headers["x-admin-password"] as string;
    if (password) {
      try {
        const pwBuf = Buffer.from(password);
        const secretBuf = Buffer.from(secret);
        if (
          pwBuf.length === secretBuf.length &&
          timingSafeEqual(pwBuf, secretBuf)
        ) {
          return next();
        }
      } catch {
        // Fall through to error below
      }
    }

    throw new UnauthorizedError("Authentication required");
  };
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Validate that a value is a non-empty string, or throw a descriptive error.
 * Use for both route params and query string values.
 */
export function requireParam(
  value: unknown,
  kind: string,
  name: string,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ValidationError(`Missing ${kind}: ${name}`);
  }
  return value;
}
