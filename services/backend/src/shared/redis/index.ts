import { randomUUID } from "node:crypto";
import {
  BACKEND_COMMAND,
  BACKEND_COMMAND_REPLY_PREFIX,
  type CommandMessage,
  type CommandReply,
} from "../index.js";
import { createChildLogger } from "../logger/index.js";
import Redis from "ioredis";
import { config } from "../config/index.js";

const logger = createChildLogger("redis.command-channel");

// ---------------------------------------------------------------------------
// Internal Redis clients (singletons)
// ---------------------------------------------------------------------------

let publisherClient: Redis | null = null;
let subscriberClient: Redis | null = null;

function ensureRedisConfig(): boolean {
  return !!config.REDIS_URL;
}

function createClient(): Redis {
  return new Redis(config.REDIS_URL, { keyPrefix: "" });
}

// ---------------------------------------------------------------------------
// Publisher
// ---------------------------------------------------------------------------

function getPublisher(): Redis {
  if (!publisherClient) {
    publisherClient = createClient();
    publisherClient.on("error", (err: Error) => {
      logger.error({ err }, "Redis publisher error");
    });
  }
  return publisherClient;
}

export function getCommandPublisher(): Redis {
  return getPublisher();
}

/**
 * Publish a command and wait for a reply on a dedicated reply channel.
 * Times out after `timeoutMs` (default 5000ms) and returns null.
 */
export async function publishCommand<T = unknown>(
  commandType: string,
  payload: Record<string, unknown> = {},
  timeoutMs = 5000,
): Promise<CommandReply<T> | null> {
  if (!ensureRedisConfig()) {
    logger.warn(
      { commandType },
      "Redis not configured, skipping command publish",
    );
    return null;
  }

  const id = randomUUID();
  const replyChannel = `${BACKEND_COMMAND_REPLY_PREFIX}${id}`;
  const command: CommandMessage = {
    id,
    type: commandType,
    payload,
    replyChannel,
  };

  return new Promise<CommandReply<T> | null>((resolve) => {
    const pub = getPublisher();
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      sub.unsubscribe(replyChannel).catch(() => {
        /* ignore */
      });
      logger.warn({ id, commandType }, "Command timed out waiting for reply");
      resolve(null);
    }, timeoutMs);

    const sub = getSubscriber();

    const onMessage = (channel: string, message: string) => {
      if (channel !== replyChannel || settled) return;
      settled = true;
      clearTimeout(timer);
      sub.unsubscribe(replyChannel).catch(() => {
        /* ignore */
      });

      try {
        const reply: CommandReply<T> = JSON.parse(message);
        logger.debug(
          { id, commandType, success: reply.success },
          "Command reply received",
        );
        resolve(reply);
      } catch (err) {
        logger.error({ id, err }, "Failed to parse command reply");
        resolve(null);
      }
    };

    sub.on("message", onMessage);

    sub
      .subscribe(replyChannel)
      .then(() => {
        pub
          .publish(BACKEND_COMMAND, JSON.stringify(command))
          .then(() => {
            logger.debug({ id, commandType }, "Command published");
          })
          .catch((err: Error) => {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              sub.unsubscribe(replyChannel).catch(() => {
                /* ignore */
              });
              logger.error({ err }, "Failed to publish command");
              resolve(null);
            }
          });
      })
      .catch((err: Error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          logger.error({ err }, "Failed to subscribe to reply channel");
          resolve(null);
        }
      });
  });
}

/**
 * Publish a command without waiting for a reply (fire-and-forget).
 */
export async function publishCommandNoReply(
  commandType: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  if (!ensureRedisConfig()) {
    logger.warn(
      { commandType },
      "Redis not configured, skipping command publish",
    );
    return;
  }

  const id = randomUUID();
  const command: CommandMessage = {
    id,
    type: commandType,
    payload,
    replyChannel: "",
  };

  await getPublisher().publish(BACKEND_COMMAND, JSON.stringify(command));
  logger.debug({ id, commandType }, "Command published (no reply)");
}

// ---------------------------------------------------------------------------
// Subscriber (for receiving replies and other pub/sub messages)
// ---------------------------------------------------------------------------

function getSubscriber(): Redis {
  if (!subscriberClient) {
    subscriberClient = createClient();
    subscriberClient.on("error", (err: Error) => {
      logger.error({ err }, "Redis subscriber error");
    });
  }
  return subscriberClient;
}

export function getCommandSubscriber(): Redis {
  return getSubscriber();
}

/**
 * Subscribe to a Redis channel with a handler. Returns unsubscribe function.
 */
export function subscribe(
  channel: string,
  handler: (message: string) => void,
): () => Promise<void> {
  const sub = getSubscriber();

  const onMessage = (_ch: string, message: string) => {
    try {
      handler(message);
    } catch (err) {
      logger.error({ channel, err }, "Error in Redis subscription handler");
    }
  };

  sub.on("message", onMessage);
  sub.subscribe(channel).catch((err: Error) => {
    logger.error({ channel, err }, "Failed to subscribe to Redis channel");
  });

  return async () => {
    sub.removeListener("message", onMessage);
    await sub.unsubscribe(channel);
  };
}

// ---------------------------------------------------------------------------
// Status helpers — read keys set by discord-gateway
// ---------------------------------------------------------------------------

export async function readRedisStatus(
  key: string,
): Promise<Record<string, unknown> | null> {
  if (!ensureRedisConfig()) {
    return null;
  }

  try {
    const raw = await getPublisher().get(key);
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function writeRedisStatus(
  key: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (!ensureRedisConfig()) {
    return;
  }

  await getPublisher().set(key, JSON.stringify(data));
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export async function startCommandBridge(): Promise<void> {
  if (!ensureRedisConfig()) {
    logger.info("Redis not configured, skipping command channel bridge");
    return;
  }

  // Warm up both clients so connection errors surface early
  getPublisher();
  getSubscriber();
  logger.info("Redis command channel initialized");
}

export async function stopCommandBridge(): Promise<void> {
  if (publisherClient) {
    await publisherClient.quit();
    publisherClient = null;
  }
  if (subscriberClient) {
    await subscriberClient.quit();
    subscriberClient = null;
  }
  logger.info("Redis command channel stopped");
}
