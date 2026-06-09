import { createChildLogger } from "@bete/shared/logger";

const logger = createChildLogger("pagination");

export interface CursorData {
  created_at: number;
  id: string;
}

export function encodeCursor(data: CursorData): string {
  const encoded = Buffer.from(JSON.stringify(data)).toString("base64");
  logger.debug({ id: data.id, createdAt: data.created_at }, "Encoded cursor");
  return encoded;
}

export function decodeCursor(cursor?: string): CursorData | null {
  if (!cursor) {
    logger.debug("No cursor provided to decode");
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
    if (typeof data.created_at === "number" && typeof data.id === "string") {
      logger.debug(
        { id: data.id, createdAt: data.created_at },
        "Decoded cursor",
      );
      return data;
    }
    logger.warn({ cursor }, "Decoded cursor has invalid shape");
    return null;
  } catch (err) {
    logger.warn({ cursor, error: String(err) }, "Failed to decode cursor");
    return null;
  }
}
