export class ApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

function getBaseUrl(): string {
  if (typeof window === "undefined") return "";
  const protocol = window.location.protocol.replace(":", "");
  const hostname = window.location.hostname;
  const port = window.location.port;

  // In local dev, frontend (port 3000) proxies API calls to backend (port 3001)
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    const apiPort = port === "3000" ? "3001" : port;
    return `${protocol}://${hostname}:${apiPort}`;
  }

  // Production: nginx proxies /api/* to backend
  return `${protocol}://${hostname}${port ? `:${port}` : ""}`;
}

export async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;

  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method,
    headers,
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
  get: <T>(path: string) => apiRequest<T>("GET", path),
  post: <T>(path: string, body?: unknown) => apiRequest<T>("POST", path, body),
  delete: <T>(path: string) => apiRequest<T>("DELETE", path),
};
