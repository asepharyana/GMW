import type { Client } from "discord.js-selfbot-v13";
import Redis from "ioredis";
import { config } from "../../shared/config/config.js";
import {
  BACKEND_COMMAND,
  type CommandMessage,
  type CommandReply,
  MEDIA_STATUS_KEY,
  VOICE_STATUS_KEY,
} from "../../shared/index.js";
import { createChildLogger } from "../../shared/logger/index.js";
import type { VoiceController } from "../voice-recording/voiceController.js";
import { GuildHandler } from "./guild.handler.js";
import {
  type CommandHandlerFn,
  createHandlerRegistry,
} from "./handler-registry.js";
import { MediaHandler } from "./media.handler.js";
import { ModerationHandler } from "./moderation.handler.js";
import { VoiceHandler } from "./voice.handler.js";

const logger = createChildLogger("command-handler");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VoiceStatusPayload {
  connected: boolean;
  activeGuildId: string | null;
  activeChannelId: string | null;
  activeChannelName: string | null;
  connections: Array<{
    guildId: string;
    channelId: string;
    channelName: string;
    connectedAt: number;
  }>;
}

// ---------------------------------------------------------------------------
// CommandHandler
// ---------------------------------------------------------------------------

export class CommandHandler {
  private redisSub: Redis;
  private redisPub: Redis;
  private voiceController: VoiceController | null = null;
  private registry: Map<string, CommandHandlerFn> = new Map();
  private voiceHandler!: VoiceHandler;
  private mediaHandler!: MediaHandler;
  private guildHandler!: GuildHandler;
  private moderationHandler!: ModerationHandler;

  constructor() {
    // Dedicated Redis connection needed because: Redis requires a dedicated
    // connection for SUBSCRIBE mode — a subscribed connection cannot perform
    // publish/set operations. This connection listens on backend:command for
    // inbound requests from the backend.
    this.redisSub = new Redis(config.REDIS_URL); // Dedicated Redis connection needed because: Redis requires a dedicated
    // PUBLISH connection (cannot share with redisSub which is in SUBSCRIBE mode).
    // Handles command reply publishing and voice/media status key updates.
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
    this.voiceController = voiceController;

    // Create domain-specific handlers with their dependencies
    this.voiceHandler = new VoiceHandler(client, voiceController);
    this.mediaHandler = new MediaHandler(client, () =>
      voiceController.getStatus(),
    );
    this.guildHandler = new GuildHandler(client);
    this.moderationHandler = new ModerationHandler(client);

    // Build the command registry
    this.registry = createHandlerRegistry(
      this.voiceHandler,
      this.mediaHandler,
      this.guildHandler,
      this.moderationHandler,
    );

    this.redisSub.on("message", (_channel, message) => {
      this.handleCommand(message).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ error: msg }, "Failed to handle command");
      });
    });

    this.redisSub.subscribe(BACKEND_COMMAND, (err) => {
      if (err) {
        logger.error({ error: err }, "Failed to subscribe to command channel");
      } else {
        logger.info(`Subscribed to Redis channel "${BACKEND_COMMAND}"`);
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
    let cmd: CommandMessage;
    try {
      cmd = JSON.parse(raw) as CommandMessage;
    } catch {
      logger.warn({ raw }, "Received invalid JSON on command channel");
      return;
    }

    logger.info({ commandId: cmd.id, type: cmd.type }, "Received command");

    let reply: CommandReply<unknown>;

    try {
      const handler = this.registry.get(cmd.type);
      if (handler) {
        reply = await handler(cmd);
      } else {
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

  // ---- Status publishing ----

  private publishVoiceStatus(): void {
    const raw = this.voiceController
      ? this.voiceController.getStatus()
      : {
          ready: false,
          connected: false,
          activeGuildId: null,
          activeChannelId: null,
          activeChannelName: null,
          connections: [],
        };
    const status: VoiceStatusPayload = {
      connected: raw.connected,
      activeGuildId: raw.activeGuildId,
      activeChannelId: raw.activeChannelId,
      activeChannelName: raw.activeChannelName,
      connections: raw.connections ?? [],
    };

    this.setKey(VOICE_STATUS_KEY, JSON.stringify(status));
  }

  private publishMediaStatus(): void {
    this.setKey(
      MEDIA_STATUS_KEY,
      JSON.stringify(this.mediaHandler.getCurrentMediaStatus()),
    );
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
