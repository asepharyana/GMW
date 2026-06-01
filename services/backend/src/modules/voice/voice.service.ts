import { getDatabase } from "../../shared/database/index.js";

export interface Guild {
  id: string;
  name: string;
}

export interface Channel {
  id: string;
  name: string;
  type: "voice" | "text";
}

export interface VoiceStatus {
  connected: boolean;
  guildId: string | null;
  channelId: string | null;
  users: Array<{ id: string; name: string }>;
}

/**
 * Get guilds from database (distinct guild_id from messages).
 */
export async function getGuilds(): Promise<Guild[]> {
  const db = getDatabase();
  const result = await db.execute(
    "SELECT DISTINCT guild_id FROM messages ORDER BY guild_id",
  );

  if (!result?.rows?.length) {
    return [];
  }

  return result.rows.map((row: Record<string, unknown>) => ({
    id: String(row.guild_id ?? ""),
    name: `Guild ${String(row.guild_id).slice(0, 8)}`,
  }));
}

/**
 * Get text channels from database (distinct channel_id for a guild).
 */
export async function getTextChannels(guildId: string): Promise<Channel[]> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT DISTINCT channel_id FROM messages WHERE guild_id = '${guildId.replace(/'/g, "''")}' ORDER BY channel_id`,
  );

  if (!result?.rows?.length) {
    return [];
  }

  return result.rows.map((row: Record<string, unknown>) => ({
    id: String(row.channel_id ?? ""),
    name: `Channel ${String(row.channel_id).slice(0, 8)}`,
    type: "text" as const,
  }));
}

/**
 * Get voice channels — not available via API-only backend.
 */
export async function getVoiceChannels(_guildId: string): Promise<Channel[]> {
  return [];
}

/**
 * Get current voice connection status.
 */
export function getVoiceStatus(): VoiceStatus {
  return {
    connected: false,
    guildId: null,
    channelId: null,
    users: [],
  };
}

/**
 * Connect to a voice channel — not supported via API-only backend.
 */
export async function connectVoice(
  _guildId: string,
  _channelId: string,
): Promise<VoiceStatus> {
  return getVoiceStatus();
}

/**
 * Disconnect from voice — not supported via API-only backend.
 */
export async function disconnectVoice(): Promise<VoiceStatus> {
  return getVoiceStatus();
}
