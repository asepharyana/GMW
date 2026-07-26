/**
 * Format a number with locale separators.
 */
export function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * Format bytes into a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Safely parse a JSON string into an array.
 */
export function safeParseJsonArray(
  value: string | null | undefined,
): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

/**
 * Safely parse a JSON string into an object.
 */
export function safeParseJsonObject(
  value: string | null | undefined,
): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === "object" && parsed !== null) return parsed;
    return {};
  } catch {
    return {};
  }
}
