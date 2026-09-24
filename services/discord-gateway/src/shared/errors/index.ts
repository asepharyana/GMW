// Custom error classes for all services

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", 400, details);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(`${resource} not found${id ? `: ${id}` : ""}`, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, "UNAUTHORIZED", 401);
    this.name = "UnauthorizedError";
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "DATABASE_ERROR", 500, details);
    this.name = "DatabaseError";
  }
}

export class ConfigError extends AppError {
  constructor(message: string) {
    super(message, "CONFIG_ERROR", 500);
    this.name = "ConfigError";
  }
}

// ---------------------------------------------------------------------------
// Generic error helpers (shared by every module — avoids the repeated
// `err instanceof Error ? err.message : String(err)` pattern, 18+ sites)
// ---------------------------------------------------------------------------

/** Normalize an unknown thrown value to a readable message. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * True when an error code is a transient stream-teardown failure
 * (EPIPE / stream destroyed / write-after-end / socket reset).
 *
 * These are NOT fatal: crashing the gateway on them (e.g. voice stop races,
 * ffmpeg stdin closed while we still write) takes the whole bot offline
 * mid-operation. Callers that install process-level handlers use this to
 * log-and-continue instead of shutting down.
 */
export function isTransientStreamError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code ?? "";
  return (
    code === "EPIPE" ||
    code === "ERR_STREAM_DESTROYED" ||
    code === "ERR_STREAM_WRITE_AFTER_END" ||
    code === "ECONNRESET"
  );
}
