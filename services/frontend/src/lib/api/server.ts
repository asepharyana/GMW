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
  DashboardActivity,
  DashboardStats,
  Guild,
  MediaState,
  ModerationStats,
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
