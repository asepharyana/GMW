import type { Client } from "discord.js-selfbot-v13";
import Redis from "ioredis";
import { config } from "../../shared/config/config.js";
import {
  BACKEND_COMMAND,
  type CommandMessage,
  type CommandReply,
} from "../../shared/index.js";
import { createChildLogger } from "../../shared/logger/index.js";
import { GuildHandler } from "./guild.handler.js";
import {
  type CommandHandlerFn,
  createHandlerRegistry,
} from "./handler-registry.js";
import { ModerationHandler } from "./moderation.handler.js";

const logger = createChildLogger("command-handler");

// ---------------------------------------------------------------------------
// CommandHandler
// ---------------------------------------------------------------------------

export class CommandHandler {
  private redisSub: Redis;
  private redisPub: Redis;
  private registry: Map<string, CommandHandlerFn> = new Map();
  private guildHandler!: GuildHandler;
  private moderationHandler!: ModerationHandler;

  constructor() {
    // Dedicated Redis connection needed because: Redis requires a dedicated
    // connection for SUBSCRIBE mode — a subscribed connection cannot perform
    // publish/set operations. This connection listens on backend:command for
    // inbound requests from the backend.
    this.redisSub = new Redis(config.REDIS_URL);
    // A second dedicated connection for PUBLISH — a connection in SUBSCRIBE
    // mode cannot publish, so replies go out on this one.
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
   * Attach the Discord client, then subscribe to the Redis command channel.
   * Must be called *after* the Discord client is created.
   */
  start(client: Client): void {
    // Create domain-specific handlers with their dependencies
    this.guildHandler = new GuildHandler(client);
    this.moderationHandler = new ModerationHandler(client);

    // Build the command registry
    this.registry = createHandlerRegistry(
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
  }

  async close(): Promise<void> {
    await Promise.allSettled([this.redisSub.quit(), this.redisPub.quit()]);
  }

  // ---- Command dispatch ----

  /** Normalize an unknown thrown value to a readable message. */
  private static errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

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
      const message = CommandHandler.errorMessage(err);
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
  }
}
