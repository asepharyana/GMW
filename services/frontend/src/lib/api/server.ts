/**
 * Server-only data layer.
 *
 * These fetchers run exclusively on the Next.js server (React Server
 * Components / route handlers). They call the backend over HTTP directly
 * (`GMW_BACKEND_URL`), so the browser never needs a client round-trip for the
 * initial page data — the first paint is server-rendered.
 *
 * Never import this module from a client component. Browser code should keep
 * using `@/lib/api/client` (same-origin via the reverse proxy) for live ops.
 */

import type {
  AppConfig,
  DashboardActivity,
  DashboardStats,
  Guild,
  MediaState,
  ModerationAction,
  ModerationStats,
  PaginatedRecordings,
  VoiceStatus,
} from "@/lib/types";

const BACKEND_URL =
  process.env.GMW_BACKEND_URL?.replace(/\/+$/, "") || "http://127.0.0.1:4001";

export class ApiServerError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ApiServerError";
    this.statusCode = statusCode;
  }
}

async function serverFetch<T>(
  path: string,
  init?: { timeoutMs?: number },
): Promise<T> {
  const url = `${BACKEND_URL}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    init?.timeoutMs ?? 8_000,
  );

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiServerError(text || `HTTP ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}

// ---- Dashboard ----

export async function getDashboardStats(): Promise<DashboardStats> {
  return serverFetch<DashboardStats>("/api/dashboard/stats");
}

export async function getActivity(days = 14): Promise<DashboardActivity> {
  return serverFetch<DashboardActivity>(`/api/dashboard/activity?days=${days}`);
}

// ---- Media ----

export async function getMediaStatus(): Promise<MediaState> {
  return serverFetch<MediaState>("/api/media/status");
}

// ---- Config ----

export async function getConfig(): Promise<AppConfig> {
  return serverFetch<AppConfig>("/api/config");
}

// ---- Moderation ----

export async function getModerationStats(): Promise<ModerationStats> {
  return serverFetch<ModerationStats>("/api/moderation/stats");
}

export async function getModerationActions(
  limit = 100,
): Promise<ModerationAction[]> {
  const res = await serverFetch<{ data: ModerationAction[] }>(
    `/api/moderation/actions?limit=${limit}`,
  );
  return res.data;
}

// ---- Voice ----

export async function getGuilds(): Promise<Guild[]> {
  return serverFetch<Guild[]>("/api/guilds");
}

export async function getVoiceStatus(): Promise<VoiceStatus> {
  return serverFetch<VoiceStatus>("/api/voice/status");
}

// ---- Recordings ----

export async function getRecordings(limit = 50): Promise<PaginatedRecordings> {
  return serverFetch<PaginatedRecordings>(`/api/recordings?limit=${limit}`);
}

// ---- Messages ----

export interface MessagePageResult {
  data: import("@/lib/types").MessageRecord[];
  nextCursor: string | null;
}

export async function getMessages(
  guildId: string,
  channelId?: string,
  cursor?: string,
): Promise<MessagePageResult> {
  const params = new URLSearchParams({ guildId });
  if (channelId) params.set("channelId", channelId);
  if (cursor) params.set("cursor", cursor);
  return serverFetch<MessagePageResult>(`/api/messages?${params.toString()}`);
}
