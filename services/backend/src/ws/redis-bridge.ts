import { DISCORD_CHANNEL_TO_WS_EVENT, DISCORD_VOICE_PCM } from "../shared/index.js";
import { createChildLogger } from "../shared/logger/index.js";
import Redis from "ioredis";
import { config } from "../shared/config/index.js";
import { broadcastBinary, broadcastEvent } from "./broadcast.js";

const logger = createChildLogger("ws.redis-bridge");

/** Channels we subscribe to = all keys in DISCORD_CHANNEL_TO_WS_EVENT */
const SUBSCRIPTION_CHANNELS = Object.keys(DISCORD_CHANNEL_TO_WS_EVENT);

let subscriber: Redis | null = null;

function createSubscriber(): Redis {
  return new Redis(config.REDIS_URL, { keyPrefix: "" });
}

function handleSubscriptionMessage(channel: string, message: string): void {
  const eventType = DISCORD_CHANNEL_TO_WS_EVENT[channel];
  if (!eventType) {
    logger.warn({ channel }, "Received message for unmapped Redis channel");
    return;
  }

  let envelope: {
    type?: string;
    data?: unknown;
    timestamp?: number;
    source?: string;
  };
  try {
    envelope = JSON.parse(message);
  } catch (err) {
    logger.error({ channel, err }, "Failed to parse Redis message as JSON");
    return;
  }

  // Unwrap DiscordGatewayEvent envelope — the gateway publishes:
  // { type, data: <actual payload>, timestamp, source }
  // We only want <actual payload>, not the full envelope.
  const data = envelope.data !== undefined ? envelope.data : envelope;

  // Voice PCM: decode base64 → binary broadcast instead of JSON
  if (channel === DISCORD_VOICE_PCM) {
    const pcmPayload = data as { userId?: string; pcm?: string };
    if (pcmPayload?.pcm && pcmPayload?.userId) {
      try {
        const pcmBuffer = Buffer.from(pcmPayload.pcm, "base64");
        // Prepend userId as 4-byte FNV-1a hash
        const userIdHash = hashUserId(pcmPayload.userId);
        const binary = Buffer.alloc(4 + pcmBuffer.length);
        binary.writeUInt32LE(userIdHash, 0);
        pcmBuffer.copy(binary, 4);
        broadcastBinary(binary);
        return;
      } catch {
        // fallback to JSON broadcast on error
      }
    }
  }

  logger.debug({ channel, eventType }, "Broadcasting Redis event");
  broadcastEvent(eventType, data);
}

/** Simple 32-bit FNV-1a hash for userId → 4-byte identifier */
function hashUserId(userId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export async function startRedisBridge(): Promise<void> {
  if (!config.REDIS_URL) {
    logger.info("Redis not configured, skipping Redis bridge");
    return;
  }

  try {
    subscriber = createSubscriber();

    subscriber.on("error", (err: Error) => {
      logger.error({ err }, "Redis subscriber error");
    });

    subscriber.on("connect", () => {
      logger.info("Redis subscriber connected");
    });

    subscriber.on("reconnecting", () => {
      logger.warn("Redis subscriber reconnecting…");
    });

    subscriber.on("close", () => {
      logger.warn("Redis subscriber connection closed");
    });

    subscriber.on("message", handleSubscriptionMessage);

    await subscriber.ping();
    logger.info("Redis ping OK");

    const channels = SUBSCRIPTION_CHANNELS;
    await subscriber.subscribe(...channels);
    logger.info({ channels }, "Subscribed to Redis channels");

    logger.info("Redis bridge started");
  } catch (err) {
    logger.error({ err }, "Failed to start Redis bridge");
    throw err;
  }
}

export async function stopRedisBridge(): Promise<void> {
  if (!subscriber) {
    logger.debug("Redis bridge not running, nothing to stop");
    return;
  }

  try {
    await subscriber.quit();
    logger.info("Redis bridge stopped");
  } catch (err) {
    logger.error({ err }, "Error stopping Redis bridge");
    // Force-close on error
    subscriber.disconnect();
  } finally {
    subscriber = null;
  }
}
