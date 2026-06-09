import {
  AppError,
  UnauthorizedError,
  ValidationError,
} from "@bete/shared/errors";
import { createChildLogger } from "@bete/shared/logger";
import type { NextFunction, Request, Response } from "express";

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

export function adminAuth(adminPassword: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const password = req.headers["x-admin-password"] as string;

    if (!password || password !== adminPassword) {
      throw new UnauthorizedError("Invalid admin password");
    }

    next();
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
    throw new Error(`Missing ${kind}: ${name}`);
  }
  return value;
}
