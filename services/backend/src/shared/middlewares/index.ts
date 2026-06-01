import type { NextFunction, Request, Response } from "express";
import { AppError, UnauthorizedError } from "../errors/index.js";
import { createChildLogger } from "../logger/index.js";

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
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Import ValidationError for type checking
import { ValidationError } from "../errors/index.js";
