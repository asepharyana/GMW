import { AppError, ValidationError } from "@/shared/errors/index";
import { createChildLogger } from "@/shared/logger/index";
import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

const logger = createChildLogger("middleware");

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

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Simple in-memory rate limiter (no external dependency).
 * Tracks request counts per IP within a rolling window.
 * Use for auth endpoints to prevent brute-force attacks.
 */
export function rateLimit(opts: { windowMs: number; max: number }) {
  const { windowMs, max } = opts;
  const hits = new Map<string, { count: number; resetAt: number }>();

  // Periodic cleanup of stale entries to prevent unbounded memory growth
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of hits) {
      if (now >= value.resetAt) hits.delete(key);
    }
  }, windowMs * 2);
  cleanupInterval.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const now = Date.now();
    const entry = hits.get(ip);

    if (!entry || now >= entry.resetAt) {
      hits.set(ip, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    entry.count++;
    if (entry.count > max) {
      res.status(429).json({
        error: "TOO_MANY_REQUESTS",
        message: `Rate limit exceeded. Try again in ${Math.ceil((entry.resetAt - now) / 1000)}s.`,
      });
      return;
    }

    next();
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

/**
 * Express middleware that validates `req.body` against a Zod schema.
 * On success, replaces `req.body` with the parsed (and defaulted) value.
 * On failure, responds with 400 and the Zod validation errors.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Request body validation failed",
        details: result.error.flatten().fieldErrors,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Express middleware that validates `req.query` against a Zod schema.
 * On success, replaces `req.query` with the parsed (and defaulted) value.
 * On failure, responds with 400 and the Zod validation errors.
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Query parameter validation failed",
        details: result.error.flatten().fieldErrors,
      });
      return;
    }
    // Note: Express req.query is typed as ParsedQs — we attach parsed data
    // alongside it via a custom property. For route handlers that read req.query
    // directly, the middleware won't change the type; handlers should opt in by
    // reading from the validated result or by using the schema's output type.
    (req as Request & { validatedQuery: T }).validatedQuery = result.data;
    next();
  };
}
