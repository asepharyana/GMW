import { createChildLogger } from "@bete/shared/logger";
import type { Client } from "discord.js-selfbot-v13";
import Redis from "ioredis";
import { config } from "../../shared/config/config.js";
import { createModerationAction } from "../message-capture/messageStore.js";
import { discordPlayer } from "../voice-recording/player.js";
import { voiceTransmitter } from "../voice-recording/transmitter.js";
import type { VoiceController } from "../voice-recording/voiceController.js";

const logger = createChildLogger("command-handler");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BackendCommand {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  replyChannel: string;
}

interface CommandReply {
  id: string;
  success: boolean;
  data: unknown;
  error?: string;
}

interface VoiceStatusPayload {
  connected: boolean;
  activeGuildId: string | null;
  activeChannelId: string | null;
  activeChannelName: string | null;
}

interface MediaStatusPayload {
  playing: boolean;
  musicVolume: number;
  current: unknown;
  queue: unknown[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMMAND_CHANNEL = "backend:command";
const VOICE_STATUS_KEY = "voice:status";
const MEDIA_STATUS_KEY = "media:status";

// ---------------------------------------------------------------------------
// CommandHandler
// ---------------------------------------------------------------------------

export class CommandHandler {
  private redisSub: Redis;
  private redisPub: Redis;
  private client: Client | null = null;
  private voiceController: VoiceController | null = null;

  constructor() {
    this.redisSub = new Redis(config.REDIS_URL);
    this.redisPub = new Redis(config.REDIS_URL);

    this.redisSub.on("error", (err) => {
      logger.error({ error: err }, "Redis subscriber connection error");
    });

    this.redisSub.on("connect", () => {
      logger.info("Redis subscriber connected");
    });
  }

  // ---- Lifecycle ----

  /**
   * Attach the Discord client and VoiceController, then subscribe to the Redis
   * command channel.  Must be called *after* the Discord client is created.
   */
  start(client: Client, voiceController: VoiceController): void {
    this.client = client;
    this.voiceController = voiceController;

    this.redisSub.on("message", (_channel, message) => {
      this.handleCommand(message).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ error: msg }, "Failed to handle command");
      });
    });

    this.redisSub.subscribe(COMMAND_CHANNEL, (err) => {
      if (err) {
        logger.error({ error: err }, "Failed to subscribe to command channel");
      } else {
        logger.info(`Subscribed to Redis channel "${COMMAND_CHANNEL}"`);
      }
    });

    // Publish initial status snapshots so the backend knows the starting state.
    this.publishVoiceStatus();
    this.publishMediaStatus();
  }

  async close(): Promise<void> {
    await Promise.allSettled([this.redisSub.quit(), this.redisPub.quit()]);
  }

  // ---- Command dispatch ----

  private async handleCommand(raw: string): Promise<void> {
    let cmd: BackendCommand;
    try {
      cmd = JSON.parse(raw) as BackendCommand;
    } catch {
      logger.warn({ raw }, "Received invalid JSON on command channel");
      return;
    }

    logger.info({ commandId: cmd.id, type: cmd.type }, "Received command");

    let reply: CommandReply;

    try {
      switch (cmd.type) {
        case "voice:connect":
          reply = await this.handleVoiceConnect(cmd);
          break;
        case "voice:disconnect":
          reply = await this.handleVoiceDisconnect(cmd);
          break;
        case "voice:channels":
          reply = await this.handleVoiceChannels(cmd);
          break;
        case "voice:transmit:start":
          reply = await this.handleVoiceTransmitStart(cmd);
          break;
        case "voice:transmit:stop":
          reply = await this.handleVoiceTransmitStop(cmd);
          break;
        case "guilds:list":
          reply = await this.handleListGuilds(cmd);
          break;
        case "guilds:text-channels":
          reply = await this.handleTextChannels(cmd);
          break;
        case "media:queue":
          reply = await this.handleMediaQueue(cmd);
          break;
        case "media:skip":
          reply = await this.handleMediaSkip(cmd);
          break;
        case "media:stop":
          reply = await this.handleMediaStop(cmd);
          break;
        case "media:volume":
          reply = await this.handleMediaVolume(cmd);
          break;
        case "moderation:action":
          reply = await this.handleModerationAction(cmd);
          break;
        default:
          logger.warn({ type: cmd.type }, "Unknown command type");
          reply = {
            id: cmd.id,
            success: false,
            data: null,
            error: `Unknown command type: ${cmd.type}`,
          };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        { commandId: cmd.id, error: message },
        "Command execution failed",
      );
      reply = {
        id: cmd.id,
        success: false,
        data: null,
        error: message,
      };
    }

    // Publish reply on the designated reply channel using the persistent publisher.
    try {
      await this.redisPub.publish(cmd.replyChannel, JSON.stringify(reply));
    } catch (err) {
      logger.error({ err }, "Failed to publish command reply");
    }

    // Always refresh status keys after every command so the backend has
    // the latest snapshot without polling.
    this.publishVoiceStatus();
    this.publishMediaStatus();
  }

  // ---- Command handlers ----

  private async handleVoiceConnect(cmd: BackendCommand): Promise<CommandReply> {
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

  private async handleVoiceDisconnect(
    cmd: BackendCommand,
  ): Promise<CommandReply> {
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

  private async handleVoiceChannels(
    cmd: BackendCommand,
  ): Promise<CommandReply> {
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

  private async handleListGuilds(cmd: BackendCommand): Promise<CommandReply> {
    if (!this.client) {
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: "Gateway not initialized",
      };
    }

    try {
      const guilds = this.client.guilds.cache.map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.iconURL() ?? null,
      }));

      return { id: cmd.id, success: true, data: guilds };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { id: cmd.id, success: false, data: null, error: msg };
    }
  }

  private async handleTextChannels(cmd: BackendCommand): Promise<CommandReply> {
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
          type: "text" as const,
        }));

      return { id: cmd.id, success: true, data: textChannels };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { id: cmd.id, success: false, data: null, error: msg };
    }
  }

  private getCurrentMediaStatus(): MediaStatusPayload {
    return {
      playing: discordPlayer.getStatus() === "playing",
      musicVolume: discordPlayer.getMusicVolume(),
      current: null,
      queue: [],
    };
  }

  private async handleMediaQueue(cmd: BackendCommand): Promise<CommandReply> {
    // Media queueing is handled at a higher level (frontend / backend streams
    // audio directly).  Log the request for now.
    logger.info("media:queue received — media queueing is handled externally");
    return {
      id: cmd.id,
      success: true,
      data: this.getCurrentMediaStatus(),
    };
  }

  private async handleMediaSkip(cmd: BackendCommand): Promise<CommandReply> {
    discordPlayer.stop("music");
    return { id: cmd.id, success: true, data: this.getCurrentMediaStatus() };
  }

  private async handleMediaStop(cmd: BackendCommand): Promise<CommandReply> {
    discordPlayer.stop("music");
    return { id: cmd.id, success: true, data: this.getCurrentMediaStatus() };
  }

  private async handleMediaVolume(cmd: BackendCommand): Promise<CommandReply> {
    const volume = Number(cmd.payload.volume);
    if (!Number.isFinite(volume)) {
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: "volume must be a number",
      };
    }
    discordPlayer.setMusicVolume(volume);
    return {
      id: cmd.id,
      success: true,
      data: this.getCurrentMediaStatus(),
    };
  }

  private async handleVoiceTransmitStart(
    cmd: BackendCommand,
  ): Promise<CommandReply> {
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
      logger.info({ status }, "Voice transmit started");

      return {
        id: cmd.id,
        success: true,
        data: status,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ error: message }, "Failed to start voice transmit");
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: message,
      };
    }
  }

  private async handleVoiceTransmitStop(
    cmd: BackendCommand,
  ): Promise<CommandReply> {
    try {
      await voiceTransmitter.stop();
      logger.info("Voice transmit stopped");

      return {
        id: cmd.id,
        success: true,
        data: { status: "stopped" },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ error: message }, "Failed to stop voice transmit");
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: message,
      };
    }
  }

  private async handleModerationAction(
    cmd: BackendCommand,
  ): Promise<CommandReply> {
    const payload = cmd.payload as {
      message_id?: string;
      user_id?: string;
      guild_id?: string;
      channel_id?: string;
      action_type?: string;
      reason?: string;
      executed_by?: string;
    };

    if (
      !payload.message_id ||
      !payload.user_id ||
      !payload.guild_id ||
      !payload.action_type
    ) {
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: "message_id, user_id, guild_id, and action_type are required",
      };
    }

    const validActions = [
      "delete_message",
      "mute_user",
      "warn_user",
      "kick_user",
      "ban_user",
    ] as const;
    if (
      !validActions.includes(
        payload.action_type as (typeof validActions)[number],
      )
    ) {
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: `Invalid action_type: ${payload.action_type}. Must be one of: ${validActions.join(", ")}`,
      };
    }

    try {
      // For delete_message, also actually delete via Discord if client is available
      if (payload.action_type === "delete_message" && this.client) {
        try {
          const channelId = String(cmd.payload.channel_id ?? "");
          if (channelId) {
            const channel = await this.client.channels.fetch(channelId);
            if (channel?.isText()) {
              const msg = await channel.messages
                .fetch(payload.message_id)
                .catch(() => null);
              if (msg) {
                await msg.delete().catch((err: unknown) => {
                  logger.warn(
                    { error: err, messageId: payload.message_id },
                    "Failed to delete message via Discord",
                  );
                });
              }
            }
          }
        } catch (err) {
          logger.warn(
            { error: err, messageId: payload.message_id },
            "Failed to fetch channel/message for deletion",
          );
        }
      }

      const action = await createModerationAction({
        message_id: payload.message_id,
        user_id: payload.user_id,
        guild_id: payload.guild_id,
        action_type: payload.action_type as
          | "delete_message"
          | "mute_user"
          | "warn_user"
          | "kick_user"
          | "ban_user",
        reason: payload.reason ?? null,
        executed_by: payload.executed_by ?? "command-handler",
        status: "executed",
        error: null,
        executed_at: Date.now(),
      });

      logger.info(
        {
          actionId: action.id,
          actionType: payload.action_type,
          userId: payload.user_id,
        },
        "Moderation action executed",
      );

      return {
        id: cmd.id,
        success: true,
        data: action,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        { error: message, commandId: cmd.id },
        "Failed to execute moderation action",
      );
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: message,
      };
    }
  }

  // ---- Status publishing ----

  private publishVoiceStatus(): void {
    const status: VoiceStatusPayload = this.voiceController
      ? this.voiceController.getStatus()
      : {
          connected: false,
          activeGuildId: null,
          activeChannelId: null,
          activeChannelName: null,
        };

    this.setKey(VOICE_STATUS_KEY, JSON.stringify(status));
  }

  private publishMediaStatus(): void {
    this.setKey(MEDIA_STATUS_KEY, JSON.stringify(this.getCurrentMediaStatus()));
  }

  /**
   * Fire-and-forget SET using the persistent Redis publisher connection.
   */
  private setKey(key: string, value: string): void {
    this.redisPub.set(key, value).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ key, error: msg }, "Failed to update Redis status key");
    });
  }
}
