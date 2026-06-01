import Redis from "ioredis";
import { getPool } from "../../shared/database/index.js";
import { config } from "../../shared/config/index.js";
import { createChildLogger } from "../../shared/logger/index.js";

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

interface CommandReply {
  id: string;
  success: boolean;
  data: unknown;
  error?: string;
}

// --- Redis command client ---
let commandRedis: Redis | null = null;
let statusRedis: Redis | null = null;

function getCommandRedis(): Redis {
  if (!commandRedis) {
    commandRedis = config.REDIS_URL
      ? new Redis(config.REDIS_URL, { keyPrefix: "" })
      : new Redis({
          host: config.REDIS_HOST,
          port: config.REDIS_PORT,
          keyPrefix: "",
        });
  }
  return commandRedis;
}

function getStatusRedis(): Redis {
  if (!statusRedis) {
    statusRedis = config.REDIS_URL
      ? new Redis(config.REDIS_URL, { keyPrefix: "" })
      : new Redis({
          host: config.REDIS_HOST,
          port: config.REDIS_PORT,
          keyPrefix: "",
        });
  }
  return statusRedis;
}

async function sendCommand<T = unknown>(
  type: string,
  payload: Record<string, unknown>,
  timeoutMs = 10000,
): Promise<T | null> {
  const redis = getCommandRedis();
  const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const replyChannel = `backend:command:reply:${id}`;

  return new Promise<T | null>((resolve) => {
    const timer = setTimeout(() => {
      redis.unsubscribe(replyChannel).catch(() => {});
      resolve(null);
    }, timeoutMs);

    redis.subscribe(replyChannel, (err) => {
      if (err) {
        clearTimeout(timer);
        resolve(null);
        return;
      }
    });

    const handler = (_ch: string, msg: string) => {
      if (_ch === replyChannel) {
        clearTimeout(timer);
        redis.unsubscribe(replyChannel).catch(() => {});
        try {
          const reply: CommandReply = JSON.parse(msg);
          resolve(reply.success ? (reply.data as T) : null);
        } catch {
          resolve(null);
        }
      }
    };

    redis.on("message", handler);

    redis
      .publish("backend:command", JSON.stringify({ id, type, payload, replyChannel }))
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

async function readStatus<T>(key: string): Promise<T | null> {
  try {
    const val = await getStatusRedis().get(key);
    return val ? (JSON.parse(val) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Get guilds from database (distinct guild_id from messages).
 */
export async function getGuilds(): Promise<Guild[]> {
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
 * Get text channels from database (distinct channel_id for a guild).
 */
export async function getTextChannels(guildId: string): Promise<Channel[]> {
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
  const channels = await sendCommand<Channel[]>("voice:channels", { guildId });
  return channels ?? [];
}

/**
 * Get current voice connection status from Redis cache set by discord-gateway.
 */
export async function getVoiceStatus(): Promise<VoiceStatus> {
  const cached = await readStatus<VoiceStatus>("voice:status");
  if (cached) return cached;
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
  const result = await sendCommand<VoiceStatus>("voice:connect", {
    guildId,
    channelId,
  });
  if (result) return result;

  // Fallback: read from Redis status key
  const cached = await readStatus<VoiceStatus>("voice:status");
  return (
    cached ?? {
      connected: false,
      activeGuildId: null,
      activeChannelId: null,
      activeChannelName: null,
    }
  );
}

/**
 * Disconnect from voice via Redis command to discord-gateway.
 */
export async function disconnectVoice(): Promise<VoiceStatus> {
  const result = await sendCommand<VoiceStatus>("voice:disconnect", {});
  if (result) return result;

  const cached = await readStatus<VoiceStatus>("voice:status");
  return (
    cached ?? {
      connected: false,
      activeGuildId: null,
      activeChannelId: null,
      activeChannelName: null,
    }
  );
}
