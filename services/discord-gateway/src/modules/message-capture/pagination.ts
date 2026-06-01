export interface CursorData {
  created_at: number;
  id: string;
}

export function encodeCursor(data: CursorData): string {
  return Buffer.from(JSON.stringify(data)).toString("base64");
}

export function decodeCursor(cursor?: string): CursorData | null {
  if (!cursor) return null;
  try {
    const data = JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
    if (typeof data.created_at === "number" && typeof data.id === "string") {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}
