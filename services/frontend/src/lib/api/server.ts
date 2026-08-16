/**
 * Server-only data layer (React Server Components / route handlers).
 *
 * The dashboard is fully tRPC-native: this module talks to the backend's
 * tRPC HTTP endpoint (/trpc) via an httpLink client — the same appRouter the
 * browser reaches over WebSocket. No legacy REST `/api/*` is used.
 *
 * The client is loosely typed (see ./types → TRPCClient); results are asserted
 * to the frontend's local types at each call site.
 *
 * Never import this module from a client component. Browser code uses
 * `@/lib/trpc/client` (wsLink) via the `@/lib/api/*` wrappers.
 */

import { createTRPCClient, httpBatchLink } from "@trpc/client";
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
import type { TRPCClient } from "../trpc/types";

const BACKEND_URL =
  process.env.GMW_BACKEND_URL?.replace(/\/+$/, "") || "http://127.0.0.1:4001";

let _client: TRPCClient | null = null;
function serverTrpc(): TRPCClient {
  if (!_client) {
    _client = createTRPCClient({
      links: [
        httpBatchLink({
          url: `${BACKEND_URL}/trpc`,
          fetch(url, init) {
            return fetch(url, { ...init, cache: "no-store" });
          },
        }),
      ],
    }) as unknown as TRPCClient;
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
  return serverTrpc().dashboard.stats.query() as unknown as Promise<DashboardStats>;
}
export async function getActivity(days = 14): Promise<DashboardActivity> {
  return serverTrpc().dashboard.activity.query({
    days,
  }) as unknown as Promise<DashboardActivity>;
}

// ---- Media ----
export async function getMediaStatus(): Promise<MediaState> {
  return serverTrpc().media.status.query() as unknown as Promise<MediaState>;
}

// ---- Config ----
export async function getConfig(): Promise<AppConfig> {
  return serverTrpc().config.get.query() as unknown as Promise<AppConfig>;
}

// ---- Moderation ----
export async function getModerationStats(): Promise<ModerationStats> {
  return serverTrpc().moderation.stats.query() as unknown as Promise<ModerationStats>;
}
export async function getModerationActions(limit = 100) {
  const res = (await serverTrpc().moderation.actions.query({
    limit,
  })) as unknown as PaginatedModerationActions;
  return res.data;
}

// ---- Voice ----
export async function getGuilds(): Promise<Guild[]> {
  return serverTrpc().voice.guilds.query() as unknown as Promise<Guild[]>;
}
export async function getVoiceStatus(): Promise<VoiceStatus> {
  return serverTrpc().voice.status.query() as unknown as Promise<VoiceStatus>;
}

// ---- Recordings ----
export async function getRecordings(limit = 50): Promise<PaginatedRecordings> {
  return serverTrpc().recordings.list.query({
    limit,
  }) as unknown as Promise<PaginatedRecordings>;
}
