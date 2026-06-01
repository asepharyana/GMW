export type LogMetadata = Record<string, unknown>;

type SerializedError = {
  name: string;
  message: string;
  stack?: string;
  code?: unknown;
  statusCode?: unknown;
} & Record<string, unknown>;

const serializeError = (error: Error): SerializedError => {
  const serialized: SerializedError = {
    name: error.name,
    message: error.message,
  };

  if (error.stack) {
    serialized.stack = error.stack;
  }

  const errorWithFields = error as Error & {
    code?: unknown;
    statusCode?: unknown;
    [key: string]: unknown;
  };

  if (errorWithFields.code !== undefined) {
    serialized.code = errorWithFields.code;
  }

  if (errorWithFields.statusCode !== undefined) {
    serialized.statusCode = errorWithFields.statusCode;
  }

  for (const [key, value] of Object.entries(errorWithFields)) {
    if (serialized[key] === undefined) {
      serialized[key] = value;
    }
  }

  return serialized;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export const serializeLogValue = (
  value: unknown,
  _seen: WeakSet<object> = new WeakSet(),
): unknown => {
  if (value === null || value === undefined) return value;

  if (value instanceof Error) {
    return serializeError(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof RegExp) {
    return value.toString();
  }

  if (typeof value === "object") {
    if (_seen.has(value as object)) {
      return "[Circular]";
    }
    _seen.add(value as object);
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeLogValue(item, _seen));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        serializeLogValue(nestedValue, _seen),
      ]),
    );
  }

  if (typeof value === "object") {
    try {
      return `[Object ${(value as any)?.constructor?.name ?? "unknown"}]`;
    } catch {
      return "[Object]";
    }
  }

  return value;
};

export const formatLogMetadata = (metadata: LogMetadata): LogMetadata => {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      serializeLogValue(value),
    ]),
  );
};
