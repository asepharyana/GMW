import { AppError } from "@bete/shared/errors";
import { createChildLogger } from "@bete/shared/logger";
import type { VoiceConnection } from "@discordjs/voice";
import type { Client, Guild, VoiceChannel } from "discord.js-selfbot-v13";
import { discordPlayer } from "./player.js";
import { startRecording, stopRecording } from "./recorder.js";

const logger = createChildLogger("voice-controller");

// ─── Types ───────────────────────────────────────────────────────────────

export interface GuildVoiceState {
  guildId: string;
  channelId: string;
  channelName: string;
  connectedAt: number;
}

export interface VoiceStatus {
  ready: boolean;
  connected: boolean;
  activeGuildId: string | null;
  activeChannelId: string | null;
  activeChannelName: string | null;
  /** Multi-guild: list of all active connections */
  connections: GuildVoiceState[];
}

// ─── VoiceController ─────────────────────────────────────────────────────

export class VoiceController {
  private connections = new Map<string, GuildVoiceState>();
  private connecting = new Set<string>();

  constructor(private readonly client: Client) {}

  getStatus(): VoiceStatus {
    logger.debug("getStatus called");

    // Primary connection (legacy compat — first entry or explicitly set)
    const primaryGuildId = this.connections.keys().next().value ?? null;
    const primary = primaryGuildId
      ? this.connections.get(primaryGuildId)
      : undefined;

    return {
      ready: this.client.isReady(),
      connected: this.connections.size > 0,
      activeGuildId: primary?.guildId ?? null,
      activeChannelId: primary?.channelId ?? null,
      activeChannelName: primary?.channelName ?? null,
      connections: Array.from(this.connections.values()),
    };
  }

  async connect(guildId: string, channelId: string): Promise<VoiceStatus> {
    logger.info({ guildId, channelId }, "connect called");
    if (!this.client.isReady()) {
      throw new AppError(
        "Discord client is not ready",
        "CLIENT_NOT_READY",
        409,
      );
    }

    if (this.connecting.has(guildId)) {
      throw new AppError(
        `Voice connection for guild ${guildId} is already in progress`,
        "CONNECT_IN_PROGRESS",
        409,
      );
    }

    this.connecting.add(guildId);

    try {
      // Disconnect existing connection for this guild first
      if (this.connections.has(guildId)) {
        await this.disconnectGuild(guildId);
      }

      const guild = this.getGuild(guildId);
      const channel =
        guild.channels.cache.get(channelId) ??
        (await guild.channels.fetch(channelId).catch(() => null));

      if (!channel) {
        throw new AppError(
          "Voice channel not found",
          "VOICE_CHANNEL_NOT_FOUND",
          404,
        );
      }

      if (channel.type !== "GUILD_VOICE") {
        throw new AppError(
          "Selected channel is not a voice channel",
          "INVALID_CHANNEL_TYPE",
          400,
        );
      }

      const connection = await startRecording(
        this.client,
        channel as VoiceChannel,
      );
      if (!connection) {
        throw new AppError(
          "Failed to connect to voice channel",
          "VOICE_CONNECT_FAILED",
          500,
        );
      }

      // If this is the first connection, set it as the player's connection
      if (this.connections.size === 0) {
        discordPlayer.setConnection(connection as VoiceConnection);
      }

      const state: GuildVoiceState = {
        guildId,
        channelId,
        channelName: channel.name,
        connectedAt: Date.now(),
      };
      this.connections.set(guildId, state);

      logger.info(
        { guildId, channelId, channelName: channel.name },
        "Voice connected",
      );

      return this.getStatus();
    } finally {
      this.connecting.delete(guildId);
    }
  }

  async disconnect(): Promise<VoiceStatus> {
    logger.info("disconnect called");

    // Disconnect all guilds
    const guildIds = Array.from(this.connections.keys());
    for (const gid of guildIds) {
      await this.disconnectGuild(gid);
    }

    discordPlayer.stop();
    return this.getStatus();
  }

  async disconnectGuild(guildId: string): Promise<void> {
    logger.info({ guildId }, "disconnectGuild called");
    if (this.connections.has(guildId)) {
      stopRecording(guildId);
      this.connections.delete(guildId);
    }
  }

  private getGuild(guildId: string): Guild {
    const guild = this.client.guilds.cache.get(guildId);

    if (!guild) {
      throw new AppError("Guild not found", "GUILD_NOT_FOUND", 404);
    }

    return guild;
  }
}
