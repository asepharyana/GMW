import { getPool } from "../../shared/database/index.js";
import {
  publishCommand,
  readRedisStatus,
} from "../../shared/redis/index.js";
import { createChildLogger } from "@bete/shared/logger";

const logger = createChildLogger("voice.service");

export interface Guild {
  id: string;
  name: string;
  icon: string | null;
}

export interface Channel {
  id: string;
  name: string;
  type: "voice" | "text";
}

export interface VoiceStatus {
  connected: boolean;
  activeGuildId: string | null;
  activeChannelId: string | null;
  activeChannelName: string | null;
}

/**
 * Get guilds — query from discord-gateway via Redis command for real names.
 * Falls back to database (distinct guild_id from messages) if gateway unreachable.
 */
export async function getGuilds(): Promise<Guild[]> {
  const reply = await publishCommand<Guild[]>("guilds:list", {});
  if (reply?.success && reply.data && reply.data.length > 0)
    return reply.data;

  // Fallback: Postgres with synthetic names
  logger.warn(
    "discord-gateway unreachable, falling back to Postgres for guilds",
  );
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT DISTINCT guild_id FROM messages ORDER BY guild_id`,
  );

  return rows.map((row: Record<string, unknown>) => ({
    id: String(row.guild_id ?? ""),
    name: `Guild ${String(row.guild_id).slice(0, 8)}`,
    icon: null,
  }));
}

/**
 * Get text channels — query from discord-gateway via Redis command for real names.
 * Falls back to database if gateway unreachable.
 */
export async function getTextChannels(guildId: string): Promise<Channel[]> {
  const reply = await publishCommand<Channel[]>("guilds:text-channels", {
    guildId,
  });
  if (reply?.success && reply.data && reply.data.length > 0)
    return reply.data;

  // Fallback: Postgres with synthetic names
  logger.warn(
    { guildId },
    "discord-gateway unreachable, falling back to Postgres for text channels",
  );
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT DISTINCT channel_id FROM messages WHERE guild_id = $1 ORDER BY channel_id`,
    [guildId],
  );

  return rows.map((row: Record<string, unknown>) => ({
    id: String(row.channel_id ?? ""),
    name: `Channel ${String(row.channel_id).slice(0, 8)}`,
    type: "text" as const,
  }));
}

/**
 * Get voice channels — query from discord-gateway via Redis command.
 */
export async function getVoiceChannels(guildId: string): Promise<Channel[]> {
  const reply = await publishCommand<Channel[]>("voice:channels", { guildId });
  return reply?.success && reply.data ? reply.data : [];
}

/**
 * Get current voice connection status from Redis cache set by discord-gateway.
 */
export async function getVoiceStatus(): Promise<VoiceStatus> {
  const cached = await readRedisStatus("voice:status");
  if (cached) return cached as unknown as VoiceStatus;
  return {
    connected: false,
    activeGuildId: null,
    activeChannelId: null,
    activeChannelName: null,
  };
}

/**
 * Connect to a voice channel via Redis command to discord-gateway.
 */
export async function connectVoice(
  guildId: string,
  channelId: string,
): Promise<VoiceStatus> {
  const reply = await publishCommand<VoiceStatus>("voice:connect", {
    guildId,
    channelId,
  });
  if (reply?.success && reply.data) return reply.data;

  // Fallback: read from Redis status key
  const cached = await readRedisStatus("voice:status");
  return (cached as unknown as VoiceStatus) ?? {
    connected: false,
    activeGuildId: null,
    activeChannelId: null,
    activeChannelName: null,
  };
}

/**
 * Disconnect from voice via Redis command to discord-gateway.
 */
export async function disconnectVoice(): Promise<VoiceStatus> {
  const reply = await publishCommand<VoiceStatus>("voice:disconnect", {});
  if (reply?.success && reply.data) return reply.data;

  const cached = await readRedisStatus("voice:status");
  return (cached as unknown as VoiceStatus) ?? {
    connected: false,
    activeGuildId: null,
    activeChannelId: null,
    activeChannelName: null,
  };
}
