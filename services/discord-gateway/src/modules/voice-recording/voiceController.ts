import { AppError } from "@bete/shared/errors";
import { createChildLogger } from "@bete/shared/logger";
import { getVoiceConnection, type VoiceConnection } from "@discordjs/voice";
import type { Client, Guild, VoiceChannel } from "discord.js-selfbot-v13";
import { discordPlayer } from "./player.js";
import { startRecording, stopRecording } from "./recorder.js";

const logger = createChildLogger("voice-controller");

export interface VoiceStatus {
  ready: boolean;
  connected: boolean;
  activeGuildId: string | null;
  activeChannelId: string | null;
  activeChannelName: string | null;
}

export class VoiceController {
  private activeGuildId: string | null = null;
  private activeChannelId: string | null = null;
  private activeChannelName: string | null = null;
  private connecting = false;

  constructor(private readonly client: Client) {}

  getStatus(): VoiceStatus {
    logger.debug("getStatus called");
    const connection = this.activeGuildId
      ? getVoiceConnection(this.activeGuildId)
      : undefined;

    return {
      ready: this.client.isReady(),
      connected: Boolean(connection),
      activeGuildId: this.activeGuildId,
      activeChannelId: this.activeChannelId,
      activeChannelName: this.activeChannelName,
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

    if (this.connecting) {
      throw new AppError(
        "Voice connection is already in progress",
        "CONNECT_IN_PROGRESS",
        409,
      );
    }

    this.connecting = true;

    try {
      await this.disconnect();

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

      discordPlayer.setConnection(connection as VoiceConnection);
      this.activeGuildId = guildId;
      this.activeChannelId = channelId;
      this.activeChannelName = channel.name;

      logger.info(
        { guildId, channelId, channelName: channel.name },
        "Voice connected",
      );

      return this.getStatus();
    } finally {
      this.connecting = false;
    }
  }

  async disconnect(): Promise<VoiceStatus> {
    logger.info("disconnect called");
    if (this.activeGuildId) {
      stopRecording(this.activeGuildId);
    }

    discordPlayer.stop();
    this.activeGuildId = null;
    this.activeChannelId = null;
    this.activeChannelName = null;

    return this.getStatus();
  }

  private getGuild(guildId: string): Guild {
    const guild = this.client.guilds.cache.get(guildId);

    if (!guild) {
      throw new AppError("Guild not found", "GUILD_NOT_FOUND", 404);
    }

    return guild;
  }
}
