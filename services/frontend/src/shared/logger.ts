// Simple logger for frontend - structured logging wrapper
type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

class Logger {
  constructor(private context: string) {}

  private log(level: LogLevel, message: string, context?: LogContext) {
    const timestamp = new Date().toISOString();
    const logData = {
      level,
      context: this.context,
      message,
      timestamp,
      ...context,
    };

    // Use appropriate console method
    const consoleMethod = console[level] || console.log;
    consoleMethod(
      `[${level.toUpperCase()}] [${this.context}]`,
      message,
      context || "",
    );
  }

  debug(message: string, context?: LogContext) {
    this.log("debug", message, context);
  }

  info(message: string, context?: LogContext) {
    this.log("info", message, context);
  }

  warn(message: string, context?: LogContext) {
    this.log("warn", message, context);
  }

  error(message: string, context?: LogContext) {
    this.log("error", message, context);
  }
}

export function createChildLogger(context: string): Logger {
  return new Logger(context);
}
