import {
  COMMAND_GUILDS_LIST,
  COMMAND_GUILDS_TEXT_CHANNELS,
  COMMAND_VOICE_CHANNELS,
  COMMAND_VOICE_CONNECT,
  COMMAND_VOICE_DISCONNECT,
  CommandReply,
  VOICE_STATUS_KEY,
} from "@bete/shared";
import {
  createChildLogger,
  tryCommandThenFallback,
} from "../../shared/commandHelper.js";
import { getPool } from "../../shared/database/index.js";
import { publishCommand, readRedisStatus } from "../../shared/redis/index.js";

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

export const DEFAULT_VOICE_STATUS: VoiceStatus = {
  connected: false,
  activeGuildId: null,
  activeChannelId: null,
  activeChannelName: null,
  connections: [],
};

/**
 * Wraps tryCommandThenFallback with a cleaner signature for use within this module.
 * Attempts a Redis command first; on failure, falls back to the provided function.
 */
async function withFallback<T>(
  commandFn: () => Promise<CommandReply<T> | null>,
  fallbackFn: () => Promise<T>,
  name: string,
): Promise<T> {
  return tryCommandThenFallback(commandFn, fallbackFn, name);
}

function readVoiceStatusFallback(): Promise<VoiceStatus> {
  return readRedisStatus(VOICE_STATUS_KEY).then(
    (cached) => (cached as unknown as VoiceStatus) ?? DEFAULT_VOICE_STATUS,
  );
}

/**
 * Get guilds — query from discord-gateway via Redis command for real names.
 * Falls back to database (distinct guild_id from messages) if gateway unreachable.
 */
export async function getGuilds(): Promise<Guild[]> {
  logger.info("getGuilds called");
  return withFallback(
    () => publishCommand<Guild[]>(COMMAND_GUILDS_LIST, {}),
    async () => {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT DISTINCT guild_id FROM messages ORDER BY guild_id`,
      );
      return rows.map((row: Record<string, unknown>) => ({
        id: String(row.guild_id ?? ""),
        name: `Guild ${String(row.guild_id).slice(0, 8)}`,
        icon: null,
      }));
    },
    "getGuilds",
  );
}

/**
 * Get text channels — query from discord-gateway via Redis command for real names.
 * Falls back to database if gateway unreachable.
 */
export async function getTextChannels(guildId: string): Promise<Channel[]> {
  logger.info({ guildId }, "getTextChannels called");
  return withFallback(
    () => publishCommand<Channel[]>(COMMAND_GUILDS_TEXT_CHANNELS, { guildId }),
    async () => {
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
    },
    "getTextChannels",
  );
}

/**
 * Get voice channels — query from discord-gateway via Redis command.
 */
export async function getVoiceChannels(guildId: string): Promise<Channel[]> {
  logger.info({ guildId }, "getVoiceChannels called");
  const reply = await publishCommand<Channel[]>(COMMAND_VOICE_CHANNELS, {
    guildId,
  });
  return reply?.success && reply.data ? reply.data : [];
}

/**
 * Get current voice connection status from Redis cache set by discord-gateway.
 */
export async function getVoiceStatus(): Promise<VoiceStatus> {
  logger.debug("getVoiceStatus called");
  const cached = await readRedisStatus(VOICE_STATUS_KEY);
  return (cached as unknown as VoiceStatus) ?? DEFAULT_VOICE_STATUS;
}

/**
 * Connect to a voice channel via Redis command to discord-gateway.
 */
export async function connectVoice(
  guildId: string,
  channelId: string,
): Promise<VoiceStatus> {
  logger.info({ guildId, channelId }, "connectVoice called");
  return withFallback(
    () =>
      publishCommand<VoiceStatus>(COMMAND_VOICE_CONNECT, {
        guildId,
        channelId,
      }),
    () => readVoiceStatusFallback(),
    "connectVoice",
  );
}

/**
 * Disconnect from voice via Redis command to discord-gateway.
 */
export async function disconnectVoice(): Promise<VoiceStatus> {
  logger.info("disconnectVoice called");
  return withFallback(
    () => publishCommand<VoiceStatus>(COMMAND_VOICE_DISCONNECT, {}),
    () => readVoiceStatusFallback(),
    "disconnectVoice",
  );
}

