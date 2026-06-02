// ─── Shared HTTP client — all API endpoints in one file ──────────────────────

const BE_API_URL = import.meta.env.VITE_BE_API_URL || "http://localhost:3001";
const BE_WS_URL = import.meta.env.VITE_BE_WS_URL || "ws://localhost:3001";

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

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const password = localStorage.getItem("admin-password");
  const url = path.startsWith("http") ? path : `${BE_API_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(password ? { "X-Admin-Password": password } : {}),
    },
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
    throw new ApiError(code, message, res.status);
  }

  return res.json() as Promise<T>;
}

export function getWebSocketURL(): string {
  return BE_WS_URL;
}

export function getAPIURL(): string {
  return BE_API_URL;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PageResult<T> {
  data: T[];
  nextCursor: string | null;
}

export interface MessageRecord {
  id: string;
  guild_id: string;
  channel_id: string;
  thread_id: string | null;
  user_id: string;
  username: string;
  avatar_url: string | null;
  content: string;
  edited_content: string | null;
  created_at: number;
  edited_at: number | null;
  deleted_at: number | null;
  type: "text" | "edited" | "deleted";
  metadata: string | null;
  ai_status?: string | null;
  ai_moderation_flags?: string | null;
  ai_moderation_score?: number | null;
  ai_analysis?: string | null;
  ai_categories?: string | null;
  ai_severity?: string | null;
  ai_confidence?: number | null;
  ai_recommended_action?: string | null;
  ai_analyzed_at?: number | null;
  ai_error?: string | null;
}

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

export interface VoiceStatus {
  connected: boolean;
  activeGuildId?: string | null;
  activeChannelId?: string | null;
  activeChannelName?: string | null;
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
  activeTab?: "live" | "messages" | "analytics";
  isListening?: boolean;
  isStreaming?: boolean;
}

export interface AppConfig {
  monitorGuildId: string | null;
}

export type DashboardTab = "live" | "messages" | "analytics";

// ─── Messages ────────────────────────────────────────────────────────────────

export function listMessages(
  params: URLSearchParams,
): Promise<PageResult<MessageRecord>> {
  return request<PageResult<MessageRecord>>(`/api/messages?${params}`);
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
  return request<VoiceStatus>("/api/status");
}

export function connectVoice(
  guildId: string,
  channelId: string,
): Promise<VoiceStatus> {
  return request<VoiceStatus>("/api/connect", {
    method: "POST",
    body: JSON.stringify({ guildId, channelId }),
  });
}

export function disconnectVoice(): Promise<VoiceStatus> {
  return request<VoiceStatus>("/api/disconnect", { method: "POST" });
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

// ─── Auth ────────────────────────────────────────────────────────────────────

export function login(password: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
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

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface HourlyBucket {
  hour: string;
  count: number;
  clean: number;
  warned: number;
  flagged: number;
  error: number;
}

export interface TopicTrend {
  topic: string;
  count: number;
  score: number;
}

export interface UserStat {
  user_id: string;
  username: string;
  avatar_url: string | null;
  message_count: number;
  edited_count: number;
  deleted_count: number;
  flagged_count: number;
  last_active: number;
}

export interface ModerationBreakdown {
  total: number;
  clean: number;
  warned: number;
  flagged: number;
  error: number;
  pending: number;
  average_score: number;
}

export interface AnalyticsOverview {
  period: { start: number; end: number };
  messages: ModerationBreakdown;
  hourly: HourlyBucket[];
  topics: TopicTrend[];
  top_users: UserStat[];
  active_users_count: number;
  total_channels: number;
}

export interface ViolatorStat {
  user_id: string;
  username: string;
  avatar_url: string | null;
  total_messages: number;
  flagged_count: number;
  warned_count: number;
  violation_score: number;
  worst_flags: string[];
  last_violation: number;
}

export interface TrendBucket {
  date: string;
  count: number;
  clean: number;
  warned: number;
  flagged: number;
  error: number;
}

export interface HeatmapCell {
  dayOfWeek: number;
  hour: number;
  count: number;
  clean: number;
  warned: number;
  flagged: number;
}

export function fetchAnalyticsOverview(params: {
  guildId: string;
  channelId?: string;
  hours?: number;
}): Promise<AnalyticsOverview> {
  const sp = new URLSearchParams({
    guildId: params.guildId,
    ...(params.channelId && { channelId: params.channelId }),
    ...(params.hours && { hours: String(params.hours) }),
  });
  return request<AnalyticsOverview>(`/api/analytics/overview?${sp}`);
}

export function fetchHourlyStats(params: {
  guildId: string;
  channelId?: string;
  hours?: number;
}): Promise<HourlyBucket[]> {
  const sp = new URLSearchParams({
    guildId: params.guildId,
    ...(params.channelId && { channelId: params.channelId }),
    ...(params.hours && { hours: String(params.hours) }),
  });
  return request<HourlyBucket[]>(`/api/analytics/hourly?${sp}`);
}

export function fetchTopicTrends(params: {
  guildId: string;
  channelId?: string;
  hours?: number;
}): Promise<TopicTrend[]> {
  const sp = new URLSearchParams({
    guildId: params.guildId,
    ...(params.channelId && { channelId: params.channelId }),
    ...(params.hours && { hours: String(params.hours) }),
  });
  return request<TopicTrend[]>(`/api/analytics/topics?${sp}`);
}

export function fetchLeaderboard(params: {
  guildId: string;
  channelId?: string;
  hours?: number;
  limit?: number;
}): Promise<UserStat[]> {
  const sp = new URLSearchParams({
    guildId: params.guildId,
    ...(params.channelId && { channelId: params.channelId }),
    ...(params.hours && { hours: String(params.hours) }),
    ...(params.limit && { limit: String(params.limit) }),
  });
  return request<UserStat[]>(`/api/analytics/leaderboard?${sp}`);
}

export function fetchModerationStats(params: {
  guildId: string;
  channelId?: string;
  hours?: number;
}): Promise<ModerationBreakdown> {
  const sp = new URLSearchParams({
    guildId: params.guildId,
    ...(params.channelId && { channelId: params.channelId }),
    ...(params.hours && { hours: String(params.hours) }),
  });
  return request<ModerationBreakdown>(`/api/analytics/stats?${sp}`);
}

export function fetchViolators(params: {
  guildId: string;
  channelId?: string;
  hours?: number;
  limit?: number;
}): Promise<ViolatorStat[]> {
  const sp = new URLSearchParams({
    guildId: params.guildId,
    ...(params.channelId && { channelId: params.channelId }),
    ...(params.hours && { hours: String(params.hours) }),
    ...(params.limit && { limit: String(params.limit) }),
  });
  return request<ViolatorStat[]>(`/api/analytics/violators?${sp}`);
}

export function fetchTrend(params: {
  guildId: string;
  channelId?: string;
  hours?: number;
}): Promise<TrendBucket[]> {
  const sp = new URLSearchParams({
    guildId: params.guildId,
    ...(params.channelId && { channelId: params.channelId }),
    ...(params.hours && { hours: String(params.hours) }),
  });
  return request<TrendBucket[]>(`/api/analytics/trend?${sp}`);
}

export function fetchHeatmap(params: {
  guildId: string;
  channelId?: string;
  hours?: number;
}): Promise<HeatmapCell[]> {
  const sp = new URLSearchParams({
    guildId: params.guildId,
    ...(params.channelId && { channelId: params.channelId }),
    ...(params.hours && { hours: String(params.hours) }),
  });
  return request<HeatmapCell[]>(`/api/analytics/heatmap?${sp}`);
}
