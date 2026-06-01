// Custom error classes for all services

export class AppError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("VALIDATION_ERROR", 400, message, details);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super("NOT_FOUND", 404, `${resource} not found${id ? `: ${id}` : ""}`);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super("UNAUTHORIZED", 401, message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super("FORBIDDEN", 403, message);
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", 409, message);
    this.name = "ConflictError";
  }
}

export class InternalServerError extends AppError {
  constructor(
    message = "Internal server error",
    details?: Record<string, unknown>,
  ) {
    super("INTERNAL_SERVER_ERROR", 500, message, details);
    this.name = "InternalServerError";
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("DATABASE_ERROR", 500, message, details);
    this.name = "DatabaseError";
  }
}

export class ConfigError extends AppError {
  constructor(message: string) {
    super("CONFIG_ERROR", 500, message);
    this.name = "ConfigError";
  }
}

export class DiscordError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("DISCORD_ERROR", 500, message, details);
    this.name = "DiscordError";
  }
}

export class TimeoutError extends AppError {
  constructor(operation: string) {
    super("TIMEOUT", 504, `${operation} timed out`);
    this.name = "TimeoutError";
  }
}
