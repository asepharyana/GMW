import fs from "node:fs";
import path from "node:path";
import winston from "winston";
import { formatLogMetadata, serializeLogValue } from "./serialization.js";

const isDev = process.env.NODE_ENV !== "production";
const logLevel = process.env.LOG_LEVEL || (isDev ? "debug" : "info");
const logsDir = path.resolve(process.cwd(), "logs");

fs.mkdirSync(logsDir, { recursive: true });

const metadataFormat = winston.format((info) => {
  const {
    level: _level,
    message: _message,
    timestamp: _timestamp,
    ...metadata
  } = info;

  for (const key of Object.keys(metadata)) {
    delete info[key];
  }

  Object.assign(info, formatLogMetadata(metadata));
  return info;
});

const consoleFormat = winston.format.printf((info) => {
  const { level, message, timestamp, context, ...metadata } = info;
  const contextLabel = context ? ` [${String(context)}]` : "";
  const metadataText = Object.keys(metadata).length
    ? ` ${JSON.stringify(formatLogMetadata(metadata))}`
    : "";

  return `${timestamp} ${level}${contextLabel}: ${message}${metadataText}`;
});

export interface CustomLogger {
  error: (msgOrObj: any, msgOrArgs?: any, ...args: any[]) => void;
  warn: (msgOrObj: any, msgOrArgs?: any, ...args: any[]) => void;
  info: (msgOrObj: any, msgOrArgs?: any, ...args: any[]) => void;
  debug: (msgOrObj: any, msgOrArgs?: any, ...args: any[]) => void;
  trace: (msgOrObj: any, msgOrArgs?: any, ...args: any[]) => void;
  fatal: (msgOrObj: any, msgOrArgs?: any, ...args: any[]) => void;
  silent: (msgOrObj: any, msgOrArgs?: any, ...args: any[]) => void;
  child(options: { context: string } & Record<string, any>): CustomLogger;
  [key: string]: any;
}

const winstonLogger = winston.createLogger({
  level: logLevel,
  levels: winston.config.npm.levels,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    metadataFormat(),
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        metadataFormat(),
        consoleFormat,
      ),
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "app.log"),
      format: winston.format.json(),
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      format: winston.format.json(),
    }),
  ],
});

function wrapLogger(wLogger: winston.Logger): CustomLogger {
  const logAtLevel = (level: string) => {
    return (arg1: any, arg2?: any) => {
      if (arg1 instanceof Error) {
        wLogger.log(level, arg1.message, { error: arg1 });
      } else if (typeof arg1 === "object" && arg1 !== null) {
        const message = typeof arg2 === "string" ? arg2 : "";
        wLogger.log(level, message, { ...arg1 });
      } else {
        const message = typeof arg1 === "string" ? arg1 : String(arg1);
        const metadata = typeof arg2 === "object" && arg2 !== null ? arg2 : {};
        wLogger.log(level, message, metadata);
      }
    };
  };

  const wrapped: CustomLogger = {
    error: logAtLevel("error"),
    warn: logAtLevel("warn"),
    info: logAtLevel("info"),
    debug: logAtLevel("debug"),
    trace: logAtLevel("debug"),
    fatal: logAtLevel("error"),
    silent: () => {},
    child: (options: any) => {
      const childWinston = wLogger.child(options);
      return wrapLogger(childWinston);
    },
  };

  const proxy = new Proxy(wrapped, {
    get(target, prop) {
      if (prop in target) {
        return (target as any)[prop];
      }
      const val = (wLogger as any)[prop];
      if (typeof val === "function") {
        return val.bind(wLogger);
      }
      return val;
    },
  });

  return proxy;
}

export const logger: CustomLogger = wrapLogger(winstonLogger);

export const createChildLogger = (context: string): CustomLogger => {
  return logger.child({ context });
};

export const serializeLogValueForTest = serializeLogValue;
export const formatLogMetadataForTest = formatLogMetadata;
