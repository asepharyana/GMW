// ─── Shared HTTP client — all API endpoints in one file ──────────────────────

import type { MessageRecord, PageResult } from "@bete/shared";
import { createLogger } from "../lib/logger.js";
import type {
  ChatResponse,
  DashboardChannel,
  DashboardChannelDetail,
  DashboardStats,
  DashboardUser,
  DashboardUserDetail,
} from "../types/dashboard.js";
import type { Channel, Guild, GuildVoiceEntry } from "../types/guild.js";
import type { MediaItem, MediaMode, MediaState } from "../types/media.js";
import type {
  VoiceRecording,
  VoiceRecordingListResponse,
} from "../types/recording.js";
import type {
  AdminSettings,
  AppConfig,
  DashboardTab,
  UIState,
} from "../types/ui-types.js";
import type { ActiveSpeaker, VoiceStatus } from "../types/voice.js";

const logger = createLogger("api");

const BE_API_URL = import.meta.env.VITE_BE_API_URL || "http://localhost:3001";

const DEFAULT_TIMEOUT_MS = 15000;

class ApiError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

// Cache admin session token in memory — read from sessionStorage once on first call
// NOTE: _cachedToken is intentionally removed; we read directly from sessionStorage
// to support multi-tab sync (L8 fix).

/**
 * Get the current session token from sessionStorage.
 * Always reads directly from sessionStorage to support multi-tab sync.
 * Returns null if not authenticated.
 */
export function getSessionToken(): string | null {
  return sessionStorage.getItem("admin-token");
}

/**
 * Store a session token after successful login.
 */
export function setSessionToken(token: string): void {
  sessionStorage.setItem("admin-token", token);
}

/**
 * Clear the session token (logout).
 */
export function clearSessionToken(): void {
  sessionStorage.removeItem("admin-token");
}

/**
 * @deprecated Use getSessionToken() instead.
 * Kept for backward compatibility during migration.
 */
export function getAdminPassword(): string | null {
  return localStorage.getItem("admin-password");
}

/**
 * @deprecated Use setSessionToken() instead.
 */
export function setAdminPassword(password: string): void {
  localStorage.setItem("admin-password", password);
}

/**
 * @deprecated Use clearSessionToken() instead.
 */
export function clearAdminPassword(): void {
  localStorage.removeItem("admin-password");
}

function buildSearchParams(
  params: Record<string, string | number | undefined | null>,
): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") {
      sp.set(key, String(value));
    }
  }
  return sp;
}

export async function request<T>(
  path: string,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<T> {
  const token = getSessionToken();
  const url = path.startsWith("http") ? path : `${BE_API_URL}${path}`;
  const signal = AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS);
  logger.debug("Request", { method: init?.method ?? "GET", url });

  const headers: Record<string, string> = {};

  // Only set Content-Type for non-FormData bodies
  // FormData sets its own Content-Type (multipart/form-data with boundary)
  if (!(init?.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  // Prefer Bearer token (new auth method)
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    // Fallback: X-Admin-Password (for backward compatibility)
    const password = getAdminPassword();
    if (password) {
      headers["X-Admin-Password"] = password;
    }
  }

  const res = await fetch(url, {
    headers,
    signal,
    ...init,
  });

  if (!res.ok) {
    let message = res.statusText;
    let code = "REQUEST_FAILED";
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      if (body.message) message = body.message;
      if (body.error) code = body.error;
    } catch {
      // ignore parse errors
    }
    logger.error("Request failed", { url, status: res.status, code, message });

    // Auto-logout on 401: token expired / invalidated
    if (res.status === 401) {
      clearSessionToken();
      window.location.reload();
    }

    throw new ApiError(code, message, res.status);
  }

  const result = (await res.json()) as T;
  logger.debug("Response", { url, status: res.status });
  return result;
}

export function getAPIURL(): string {
  return BE_API_URL;
}

// ─── Re-exports ──────────────────────────────────────────────────────────────

export type {
  ActiveSpeaker,
  AdminSettings,
  AppConfig,
  Channel,
  ChatResponse,
  DashboardChannel,
  DashboardChannelDetail,
  DashboardStats,
  DashboardTab,
  DashboardUser,
  DashboardUserDetail,
  Guild,
  GuildVoiceEntry,
  MediaItem,
  MediaMode,
  MediaState,
  MessageRecord,
  PageResult,
  UIState,
  VoiceRecording,
  VoiceRecordingListResponse,
  VoiceStatus,
};

// ─── Messages ────────────────────────────────────────────────────────────────

export function listMessages(params: {
  guildId: string;
  channelId?: string;
  limit?: number;
  cursor?: string;
}): Promise<PageResult<MessageRecord>> {
  const sp = buildSearchParams({
    guildId: params.guildId,
    limit: params.limit ?? 100,
    channelId: params.channelId,
    cursor: params.cursor,
  });
  return request<PageResult<MessageRecord>>(`/api/messages?${sp}`);
}

export function listReview(
  params: URLSearchParams,
): Promise<PageResult<MessageRecord>> {
  return request<PageResult<MessageRecord>>(`/api/review?${params}`);
}

export function reanalyzeMessage(id: string): Promise<void> {
  return request<void>(`/api/messages/${id}/reanalyze`, { method: "POST" });
}

export function getMessageById(id: string): Promise<MessageRecord | null> {
  return request<MessageRecord | null>(`/api/messages/detail/${id}`);
}

export function reanalyzeErrorBatch(opts: {
  guildId?: string;
  channelId?: string;
  messageIds?: string[];
}): Promise<{ ok: boolean; count: number }> {
  return request<{ ok: boolean; count: number }>(
    "/api/messages/reanalyze-batch",
    { method: "POST", body: JSON.stringify(opts) },
  );
}

// ─── Guilds / Config ─────────────────────────────────────────────────────────

export function getGuilds(): Promise<Guild[]> {
  return request<Guild[]>("/api/guilds");
}

export function getAppConfig(): Promise<AppConfig> {
  return request<AppConfig>("/api/config");
}

// ─── Voice ───────────────────────────────────────────────────────────────────

export function getVoiceChannels(guildId: string): Promise<Channel[]> {
  return request<Channel[]>(`/api/guilds/${guildId}/voice-channels`);
}

export function getTextChannels(guildId: string): Promise<Channel[]> {
  return request<Channel[]>(`/api/guilds/${guildId}/channels`);
}

export function getVoiceStatus(): Promise<VoiceStatus> {
  return request<VoiceStatus>("/api/voice/status");
}

export function connectVoice(
  guildId: string,
  channelId: string,
): Promise<VoiceStatus> {
  return request<VoiceStatus>("/api/voice/connect", {
    method: "POST",
    body: JSON.stringify({ guildId, channelId }),
  });
}

export function disconnectVoice(): Promise<VoiceStatus> {
  return request<VoiceStatus>("/api/voice/disconnect", { method: "POST" });
}

// ─── Media ───────────────────────────────────────────────────────────────────

export function getMediaStatus(): Promise<MediaState> {
  return request<MediaState>("/api/media/status");
}

export function queueMedia(
  source: string,
  mode: "music" | "screen",
): Promise<MediaState> {
  return request<MediaState>("/api/media/queue", {
    method: "POST",
    body: JSON.stringify({ source, mode }),
  });
}

export function skipMedia(): Promise<MediaState> {
  return request<MediaState>("/api/media/skip", { method: "POST" });
}

export function stopMedia(): Promise<MediaState> {
  return request<MediaState>("/api/media/stop", { method: "POST" });
}

export function setMediaVolume(volume: number): Promise<MediaState> {
  return request<MediaState>("/api/media/volume", {
    method: "POST",
    body: JSON.stringify({ volume }),
  });
}

// ─── Recordings ──────────────────────────────────────────────────────────────

export function listRecordings(params?: {
  limit?: number;
  cursor?: string;
}): Promise<VoiceRecordingListResponse> {
  const sp = buildSearchParams({
    limit: params?.limit ?? 50,
    cursor: params?.cursor,
  });
  return request<VoiceRecordingListResponse>(`/api/recordings?${sp}`);
}

export function deleteRecording(id: string): Promise<void> {
  return request<void>(`/api/recordings/${id}`, { method: "DELETE" });
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export function login(
  password: string,
): Promise<{ ok: boolean; token?: string }> {
  return request<{ ok: boolean; token?: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

/**
 * Server-side logout: increments token version, invalidating all sessions.
 * Call this before clearing local state so the token is properly revoked.
 */
export function logout(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}
// ─── Admin Settings ──────────────────────────────────────────────────────────

export function getAdminSettings(): Promise<AdminSettings> {
  return request<AdminSettings>("/api/admin/settings");
}

export function updateAdminSettings(
  patch: Partial<{ dashboardIsPublic: boolean }>,
): Promise<AdminSettings> {
  return request<AdminSettings>("/api/admin/settings", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────

export function getDashboardStats(): Promise<DashboardStats> {
  return request<DashboardStats>("/api/dashboard/stats");
}

export function listDashboardUsers(
  params: { limit?: number; cursor?: string; search?: string } = {},
): Promise<{ data: DashboardUser[]; nextCursor: string | null }> {
  const sp = buildSearchParams({
    limit: params.limit,
    cursor: params.cursor,
    search: params.search,
  });
  return request<{ data: DashboardUser[]; nextCursor: string | null }>(
    `/api/dashboard/users?${sp}`,
  );
}

export function getDashboardUserDetail(
  userId: string,
): Promise<DashboardUserDetail> {
  return request<DashboardUserDetail>(`/api/dashboard/users/${userId}`);
}

// ─── Dashboard Channels ─────────────────────────────────────────────────────────

export function listDashboardChannels(
  params: {
    limit?: number;
    search?: string;
    guild_id?: string;
    cursor?: string;
  } = {},
): Promise<{ data: DashboardChannel[]; nextCursor: string | null }> {
  const sp = buildSearchParams({
    limit: params.limit,
    search: params.search,
    guild_id: params.guild_id,
    cursor: params.cursor,
  });
  return request<{ data: DashboardChannel[]; nextCursor: string | null }>(
    `/api/dashboard/channels?${sp}`,
  );
}

export function getDashboardChannelDetail(
  channelId: string,
): Promise<DashboardChannelDetail> {
  return request<DashboardChannelDetail>(
    `/api/dashboard/channels/${channelId}`,
  );
}

// ─── UI State ────────────────────────────────────────────────────────────────

export function getUIState(): Promise<UIState> {
  return request<UIState>("/api/ui-state");
}

export function updateUIState(patch: Partial<UIState>): Promise<UIState> {
  return request<UIState>("/api/ui-state", {
    method: "POST",
    body: JSON.stringify(patch),
  });
}
