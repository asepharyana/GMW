import Redis from "ioredis";
import type { Client } from "discord.js-selfbot-v13";
import type { VoiceController } from "../voice-recording/voiceController.js";
import { discordPlayer } from "../voice-recording/player.js";
import { config } from "../../shared/config/config.js";
import { createChildLogger } from "../../shared/logger/logger.js";

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
  playing: string;
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
  private client: Client | null = null;
  private voiceController: VoiceController | null = null;

  constructor() {
    this.redisSub = new Redis(config.REDIS_URL);

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
    await this.redisSub.quit();
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
      logger.error({ commandId: cmd.id, error: message }, "Command execution failed");
      reply = {
        id: cmd.id,
        success: false,
        data: null,
        error: message,
      };
    }

    // Publish reply on the designated reply channel.
    const redisPub = new Redis(config.REDIS_URL);
    try {
      await redisPub.publish(cmd.replyChannel, JSON.stringify(reply));
    } finally {
      await redisPub.quit();
    }

    // Always refresh status keys after every command so the backend has
    // the latest snapshot without polling.
    this.publishVoiceStatus();
    this.publishMediaStatus();
  }

  // ---- Command handlers ----

  private async handleVoiceConnect(cmd: BackendCommand): Promise<CommandReply> {
    if (!this.client || !this.voiceController) {
      return { id: cmd.id, success: false, data: null, error: "Gateway not initialized" };
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

  private async handleVoiceDisconnect(cmd: BackendCommand): Promise<CommandReply> {
    if (!this.voiceController) {
      return { id: cmd.id, success: false, data: null, error: "Gateway not initialized" };
    }

    const status = await this.voiceController.disconnect();
    return { id: cmd.id, success: true, data: status };
  }

  private async handleMediaQueue(_cmd: BackendCommand): Promise<CommandReply> {
    // Media queueing is handled at a higher level (frontend / backend streams
    // audio directly).  Log the request for now.
    logger.info("media:queue received — media queueing is handled externally");
    return {
      id: _cmd.id,
      success: true,
      data: { note: "media queueing handled externally" },
    };
  }

  private async handleMediaSkip(cmd: BackendCommand): Promise<CommandReply> {
    discordPlayer.stop("music");
    return { id: cmd.id, success: true, data: { action: "skipped" } };
  }

  private async handleMediaStop(cmd: BackendCommand): Promise<CommandReply> {
    discordPlayer.stop("music");
    return { id: cmd.id, success: true, data: { action: "stopped" } };
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
    return { id: cmd.id, success: true, data: { volume: discordPlayer.getMusicVolume() } };
  }

  // ---- Status publishing ----

  private publishVoiceStatus(): void {
    const status: VoiceStatusPayload = this.voiceController
      ? this.voiceController.getStatus()
      : { connected: false, activeGuildId: null, activeChannelId: null, activeChannelName: null };

    this.setKey(VOICE_STATUS_KEY, JSON.stringify(status));
  }

  private publishMediaStatus(): void {
    const status: MediaStatusPayload = {
      playing: discordPlayer.getStatus(),
      musicVolume: discordPlayer.getMusicVolume(),
      current: null,
      queue: [],
    };

    this.setKey(MEDIA_STATUS_KEY, JSON.stringify(status));
  }

  /**
   * Fire-and-forget SET on a separate Redis connection so we never block the
   * subscriber loop.
   */
  private setKey(key: string, value: string): void {
    const redis = new Redis(config.REDIS_URL);
    redis.set(key, value)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn({ key, error: msg }, "Failed to update Redis status key");
      })
      .finally(() => {
        void redis.quit();
      });
  }
}
