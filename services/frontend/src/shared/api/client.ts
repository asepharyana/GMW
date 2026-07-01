// ─── Shared HTTP client — all API endpoints in one file ──────────────────────

import type { MessageRecord, PageResult } from "@bete/shared";
import type {
  ChatResponse,
  DashboardChannel,
  DashboardChannelDetail,
  DashboardStats,
  DashboardUser,
  DashboardUserDetail,
} from "../../entities/dashboard/types.js";
import type {
  Channel,
  Guild,
  GuildVoiceEntry,
} from "../../entities/guild/types.js";
import type {
  MediaItem,
  MediaMode,
  MediaState,
} from "../../entities/media/types.js";
import type {
  VoiceRecording,
  VoiceRecordingListResponse,
} from "../../entities/recording/types.js";
import type {
  AppConfig,
  DashboardTab,
  UIState,
} from "../../entities/ui/types.js";
import type { ActiveSpeaker, VoiceStatus } from "../../entities/voice/types.js";
import { createLogger } from "../lib/logger.js";

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

// Cache admin password in memory — read from sessionStorage once on first call
let _cachedPassword: string | null = null;

function getAdminPassword(): string | null {
  if (_cachedPassword === null) {
    try {
      _cachedPassword = sessionStorage.getItem("admin-password");
    } catch {
      _cachedPassword = null;
    }
  }
  return _cachedPassword;
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
  const password = getAdminPassword();
  const url = path.startsWith("http") ? path : `${BE_API_URL}${path}`;
  const signal = AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS);
  logger.debug("Request", { method: init?.method ?? "GET", url });

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(password ? { "X-Admin-Password": password } : {}),
    },
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

export function getMessageById(
  id: string,
): Promise<MessageRecord | null> {
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

export function login(password: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
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
