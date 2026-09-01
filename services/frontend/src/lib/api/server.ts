/**
 * Server-only data layer (React Server Components / route handlers).
 *
 * The dashboard is fully oRPC-native: this module talks to the backend's
 * oRPC HTTP endpoint (/trpc) via a fetch RPCLink client — the same appRouter
 * the browser reaches over WebSocket. No legacy REST `/api/*` is used.
 *
 * The client is loosely typed (see ./types → ORPCClient); results are asserted
 * to the frontend's local types at each call site.
 *
 * Never import this module from a client component. Browser code uses
 * `@/lib/orpc/client` (websocket RPCLink) via the `@/lib/api/*` wrappers.
 */

import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type {
  AppConfig,
  ChannelCultureRow,
  DashboardActivity,
  DashboardStats,
  EditHistoryRow,
  FlaggedChannel,
  FlaggedDomain,
  GlossaryRow,
  Guild,
  HourlyModeration,
  MediaState,
  ModerationCoverage,
  ModerationStats,
  ModerationTrends,
  PaginatedModerationActions,
  PaginatedRecordings,
  VoiceStatus,
} from "@/lib/types";
import type { ORPCClient } from "../orpc/types";

const BACKEND_URL =
  process.env.GMW_BACKEND_URL?.replace(/\/+$/, "") || "http://127.0.0.1:4001";

let _client: ORPCClient | null = null;
function serverOrpc(): ORPCClient {
  if (!_client) {
    const link = new RPCLink({
      url: `${BACKEND_URL}/trpc`,
      // Always bypass Next.js fetch cache for live dashboard data.
      fetch(url, init) {
        return fetch(url, { ...init, cache: "no-store" });
      },
    });
    _client = createORPCClient(link) as unknown as ORPCClient;
  }
  return _client;
}

export class ApiServerError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ApiServerError";
    this.statusCode = statusCode;
  }
}

// ---- Dashboard ----
export async function getDashboardStats(): Promise<DashboardStats> {
  return serverOrpc().dashboard.stats() as unknown as Promise<DashboardStats>;
}
export async function getActivity(days = 14): Promise<DashboardActivity> {
  return serverOrpc().dashboard.activity({
    days,
  }) as unknown as Promise<DashboardActivity>;
}
export async function getUsers(limit = 20) {
  return serverOrpc().dashboard.users({
    limit,
  }) as unknown as Promise<import("@/lib/types").PaginatedUsers>;
}

// ---- Media ----
export async function getMediaStatus(): Promise<MediaState> {
  return serverOrpc().media.status() as unknown as Promise<MediaState>;
}

// ---- Config ----
export async function getConfig(): Promise<AppConfig> {
  return serverOrpc().config.get() as unknown as Promise<AppConfig>;
}

// ---- Moderation ----
export async function getModerationStats(): Promise<ModerationStats> {
  return serverOrpc().moderation.stats() as unknown as Promise<ModerationStats>;
}
export async function getModerationActions(limit = 100) {
  const res = (await serverOrpc().moderation.actions({
    limit,
  })) as unknown as PaginatedModerationActions;
  return res.data;
}
export async function getModerationTrends(
  days = 30,
): Promise<ModerationTrends> {
  return serverOrpc().moderation.trends({
    days,
  }) as unknown as Promise<ModerationTrends>;
}
export async function getTopFlaggedDomains(days = 30) {
  return serverOrpc().moderation.topDomains({
    days,
  }) as unknown as FlaggedDomain[];
}
export async function getTopFlaggedChannels(days = 30) {
  return serverOrpc().moderation.topChannels({
    days,
  }) as unknown as FlaggedChannel[];
}
export async function getHourlyModeration(days = 30) {
  return serverOrpc().moderation.byHour({
    days,
  }) as unknown as HourlyModeration[];
}
export async function getCoverage(days = 30) {
  return serverOrpc().moderation.coverage({
    days,
  }) as unknown as ModerationCoverage;
}

// ---- Voice ----
export async function getGuilds(): Promise<Guild[]> {
  return serverOrpc().voice.guilds() as unknown as Promise<Guild[]>;
}
export async function getVoiceStatus(): Promise<VoiceStatus> {
  return serverOrpc().voice.status() as unknown as Promise<VoiceStatus>;
}

// ---- Recordings ----
export async function getRecordings(limit = 50): Promise<PaginatedRecordings> {
  return serverOrpc().recordings.list({
    limit,
  }) as unknown as Promise<PaginatedRecordings>;
}

// ---- Messages (SSR seed for the streaming view) ----
// Used to seed the first paint so the feed isn't blank before the WS stream
// arrives. The client then takes over and streams the rest one frame at a time.
export async function getMessages(
  guildId: string,
  channelId?: string,
  limit = 50,
  cursor?: string,
): Promise<{
  data: import("@/lib/types").MessageRecord[];
  nextCursor: string | null;
}> {
  return serverOrpc().messages.list({
    guildId,
    channelId,
    limit,
    cursor,
  }) as unknown as Promise<{
    data: import("@/lib/types").MessageRecord[];
    nextCursor: string | null;
  }>;
}
// ---- Knowledge (public read-only) ----
export async function getChannelCultures(limit = 100) {
  return serverOrpc().knowledge.channelCultures({
    limit,
  }) as unknown as Promise<ChannelCultureRow[]>;
}
export async function getGlossary(limit = 100) {
  return serverOrpc().knowledge.glossary({
    limit,
  }) as unknown as Promise<GlossaryRow[]>;
}

export async function getRecentEdits(limit = 50): Promise<EditHistoryRow[]> {
  return serverOrpc().messages.editHistory({
    limit,
  }) as unknown as Promise<EditHistoryRow[]>;
}
