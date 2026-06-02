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
    super(
      `${resource} not found${id ? `: ${id}` : ""}`,
      "NOT_FOUND",
      404,
    );
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, "UNAUTHORIZED", 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, "FORBIDDEN", 403);
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "CONFLICT", 409);
    this.name = "ConflictError";
  }
}

export class InternalServerError extends AppError {
  constructor(
    message = "Internal server error",
    details?: Record<string, unknown>,
  ) {
    super(message, "INTERNAL_SERVER_ERROR", 500, details);
    this.name = "InternalServerError";
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

export class DiscordError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "DISCORD_ERROR", 500, details);
    this.name = "DiscordError";
  }
}

export class TimeoutError extends AppError {
  constructor(operation: string) {
    super(`${operation} timed out`, "TIMEOUT", 504);
    this.name = "TimeoutError";
  }
}
