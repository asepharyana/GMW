import { type CommandMessage, type CommandReply } from "@bete/shared";
import { createChildLogger } from "@bete/shared/logger";
import type { Client } from "discord.js-selfbot-v13";
import Redis from "ioredis";
import { config } from "../../shared/config/config.js";
import { discordPlayer } from "../voice-recording/player.js";
import { voiceTransmitter } from "../voice-recording/transmitter.js";
import type { VoiceController } from "../voice-recording/voiceController.js";

// ---------------------------------------------------------------------------
// VoiceHandler
// ---------------------------------------------------------------------------

export class VoiceHandler {
  private logger = createChildLogger("voice-handler");

  constructor(
    private client: Client | null,
    private voiceController: VoiceController | null,
  ) {}

  setClient(client: Client): void {
    this.client = client;
  }

  setVoiceController(voiceController: VoiceController): void {
    this.voiceController = voiceController;
  }

  async handleVoiceConnect(
    cmd: CommandMessage,
  ): Promise<CommandReply<unknown>> {
    if (!this.client || !this.voiceController) {
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: "Gateway not initialized",
      };
    }

    const guildId = String(cmd.payload.guildId ?? "");
    const channelId = String(cmd.payload.channelId ?? "");

    if (!guildId || !channelId) {
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: "guildId and channelId are required",
      };
    }

    const status = await this.voiceController.connect(guildId, channelId);
    return { id: cmd.id, success: true, data: status };
  }

  async handleVoiceDisconnect(
    cmd: CommandMessage,
  ): Promise<CommandReply<unknown>> {
    if (!this.voiceController) {
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: "Gateway not initialized",
      };
    }

    const status = await this.voiceController.disconnect();
    return { id: cmd.id, success: true, data: status };
  }

  async handleVoiceChannels(
    cmd: CommandMessage,
  ): Promise<CommandReply<unknown>> {
    if (!this.client) {
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: "Gateway not initialized",
      };
    }

    const guildId = String(cmd.payload.guildId ?? "");
    if (!guildId) {
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: "guildId is required",
      };
    }

    try {
      const guild = await this.client.guilds.fetch(guildId);
      const channels = await guild.channels.fetch();
      const voiceChannels = channels
        .filter((c) => c?.type === "GUILD_VOICE")
        .map((c) => ({
          id: c.id,
          name: c.name,
          type: "voice" as const,
        }));

      return { id: cmd.id, success: true, data: voiceChannels };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { id: cmd.id, success: false, data: null, error: msg };
    }
  }

  async handleGuildsList(cmd: CommandMessage): Promise<CommandReply<unknown>> {
    if (!this.client) {
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: "Gateway not initialized",
      };
    }

    try {
      const guilds = this.client.guilds.cache
        .map((guild) => ({ id: guild.id, name: guild.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return { id: cmd.id, success: true, data: guilds };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { id: cmd.id, success: false, data: null, error: msg };
    }
  }

  async handleWatchableChannels(
    cmd: CommandMessage,
  ): Promise<CommandReply<unknown>> {
    if (!this.client) {
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: "Gateway not initialized",
      };
    }

    const guildId = String(cmd.payload.guildId ?? "");
    if (!guildId) {
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: "guildId is required",
      };
    }

    try {
      const guild = await this.client.guilds.fetch(guildId);
      const channels = await guild.channels.fetch();
      const textChannels = channels
        .filter((c) => c?.type === "GUILD_TEXT")
        .map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
        }));

      return { id: cmd.id, success: true, data: textChannels };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { id: cmd.id, success: false, data: null, error: msg };
    }
  }

  async handleVoiceTransmitStart(
    cmd: CommandMessage,
  ): Promise<CommandReply<unknown>> {
    if (!discordPlayer.isConnected()) {
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: "Not connected to voice channel",
      };
    }

    try {
      // Create a new Redis connection for the transmitter
      const transmitRedis = new Redis(config.REDIS_URL);
      await voiceTransmitter.start(transmitRedis);

      const status = voiceTransmitter.getStatus();
      this.logger.info({ status }, "Voice transmit started");

      return {
        id: cmd.id,
        success: true,
        data: status,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({ error: message }, "Failed to start voice transmit");
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: message,
      };
    }
  }

  async handleVoiceTransmitStop(
    cmd: CommandMessage,
  ): Promise<CommandReply<unknown>> {
    try {
      await voiceTransmitter.stop();
      this.logger.info("Voice transmit stopped");

      return {
        id: cmd.id,
        success: true,
        data: { status: "stopped" },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({ error: message }, "Failed to stop voice transmit");
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: message,
      };
    }
  }
}
