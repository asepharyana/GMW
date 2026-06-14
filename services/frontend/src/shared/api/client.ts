// ─── Shared HTTP client — all API endpoints in one file ──────────────────────

import type { MessageRecord, PageResult } from "@bete/shared";
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

// Cache admin password in memory — read from localStorage once on first call
let _cachedPassword: string | null = null;

function getAdminPassword(): string | null {
  if (_cachedPassword === null) {
    _cachedPassword = localStorage.getItem("admin-password");
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

// ─── Types ───────────────────────────────────────────────────────────────────

export type { MessageRecord, PageResult };

export interface Guild {
  id: string;
  name: string;
  icon: string | null;
}

export interface Channel {
  id: string;
  name: string;
  type?: string;
  parentId?: string | null;
}

export interface GuildVoiceEntry {
  guildId: string;
  channelId: string;
  channelName: string;
  connectedAt: number;
}

export interface VoiceStatus {
  connected: boolean;
  activeGuildId: string | null;
  activeChannelId: string | null;
  activeChannelName: string | null;
  connections: GuildVoiceEntry[];
}

export interface ActiveSpeaker {
  id?: string;
  userId?: string;
  username: string;
  avatar: string;
  speaking: boolean;
}

export type MediaMode = "music" | "screen";

export interface MediaItem {
  id?: string;
  source: string;
  title: string;
  mode?: "music" | "screen";
  durationMs?: number | null;
  thumbnailUrl?: string | null;
}

export interface MediaState {
  playing: boolean;
  musicVolume: number;
  current: MediaItem | null;
  queue: MediaItem[];
}

export interface UIState {
  selectedGuild?: string;
  selectedVoiceGuild?: string;
  selectedVoiceChannel?: string;
  selectedTextGuild?: string;
  selectedTextChannel?: string;
  selectedAnalyticsGuild?: string;
  selectedAnalyticsChannel?: string;
  activeTab?: "live" | "messages" | "dashboard";
  isListening?: boolean;
  isStreaming?: boolean;
}

export interface AppConfig {
  monitorGuildId: string | null;
}

export interface ChatResponse {
  response?: string;
}

export type DashboardTab = "live" | "messages" | "dashboard";

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

export interface VoiceRecording {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  guild_id: string | null;
  channel_id: string | null;
  channel_name: string | null;
  filename: string;
  size_bytes: number;
  download_url: string | null;
  upload_status: "pending" | "uploaded" | "failed";
  upload_error: string | null;
  transcription?: string | null;
  created_at: number;
  uploaded_at: number | null;
}

export interface VoiceRecordingListResponse {
  items: VoiceRecording[];
  nextCursor: string | null;
  hasMore: boolean;
}

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

export interface DashboardStats {
  total_messages: number;
  total_users: number;
  total_flagged: number;
  total_clean: number;
  total_warned: number;
  total_error: number;
  total_voice_recordings: number;
  total_profiles: number;
  today_messages: number;
  today_flagged: number;
  active_users_24h: number;
  top_channels: Array<{
    channel_id: string;
    channel_name: string | null;
    message_count: number;
  }>;
  moderation_overview: {
    pending: number;
    processing: number;
    error: number;
  };
}

export interface DashboardUser {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  profile_summary: string | null;
  total_messages: number;
  flagged_count: number;
  last_message_at: number | null;
  trust_score: number | null;
}

export interface DashboardUserDetail extends DashboardUser {
  last_analyzed_at: number | null;
  clean_message_streak: number | null;
  total_infractions: number | null;
  clean_count: number;
  recent_messages: Array<{
    id: string;
    content: string;
    channel_id: string;
    created_at: number;
    ai_status: string | null;
  }>;
}

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

export interface DashboardChannel {
  channel_id: string;
  channel_name: string | null;
  guild_id: string | null;
  total_messages: number;
  flagged_count: number;
  last_message_at: number | null;
  culture_summary: string | null;
  last_analyzed_at: number | null;
}

export interface DashboardChannelDetail extends DashboardChannel {
  clean_count: number;
  recent_messages: Array<{
    id: string;
    content: string;
    channel_id: string;
    created_at: number;
    ai_status: string | null;
    username: string | null;
  }>;
}

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
