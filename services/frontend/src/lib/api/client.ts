export class ApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

/**
 * API base URL resolution.
 *
 * Default: same-origin — the production nginx (gmw-proxy) proxies /api/* to
 * the backend, so no cross-origin config is needed. For local dev against a
 * remote deployment, set NEXT_PUBLIC_API_URL (e.g. https://imphnen.asepharyana.my.id).
 */
function getBaseUrl(): string {
  const override =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_API_URL : "";
  if (override) return override.replace(/\/+$/, "");

  if (typeof window === "undefined") return "";

  const protocol = window.location.protocol.replace(":", "");
  const port = window.location.port;
  return `${protocol}://${window.location.hostname}${port ? `:${port}` : ""}`;
}

export async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;

  const finalHeaders: Record<string, string> = { ...(headers ?? {}) };
  if (body !== undefined) {
    finalHeaders["Content-Type"] ??= "application/json";
  }

  const response = await fetch(url, {
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status >= 400) {
    const text = await response.text().catch(() => "");
    throw new ApiError(text || `HTTP ${response.status}`, response.status);
  }

  // Handle 204 No Content (e.g., DELETE)
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, headers?: Record<string, string>) =>
    apiRequest<T>("GET", path, undefined, headers),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    apiRequest<T>("POST", path, body, headers),
  delete: <T>(path: string, headers?: Record<string, string>) =>
    apiRequest<T>("DELETE", path, undefined, headers),
};
