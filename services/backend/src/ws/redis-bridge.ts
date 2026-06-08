import Redis from "ioredis";
import { config } from "../shared/config/index.js";
import { getCommandPublisher } from "../shared/redis/index.js";
import { createChildLogger } from "@bete/shared/logger";
import { broadcastRaw } from "./broadcast.js";

const logger = createChildLogger("ws.redis-bridge");

interface ChannelMapping {
  channel: string;
  eventType: string;
}

const SUBSCRIPTIONS: ChannelMapping[] = [
  { channel: "discord:message:created", eventType: "message_created" },
  { channel: "discord:message:updated", eventType: "message_updated" },
  { channel: "discord:message:deleted", eventType: "message_deleted" },
  { channel: "discord:message:analyzed", eventType: "message_analyzed" },
  { channel: "discord:attachment:created", eventType: "attachment_created" },
  { channel: "discord:attachment:uploaded", eventType: "attachment_uploaded" },
  { channel: "discord:voice:started", eventType: "voice_recording_started" },
  { channel: "discord:voice:stopped", eventType: "voice_recording_stopped" },
  { channel: "discord:voice:uploaded", eventType: "voice_recording_uploaded" },
  {
    channel: "discord:analysis:queue_status",
    eventType: "analysis_queue_status",
  },
  { channel: "discord:voice:active_user", eventType: "voice_active_user" },
];

// Binary channels that need special handling (messageBuffer event)
const BINARY_CHANNELS = ["discord:voice:pcm"];

let subscriber: Redis | null = null;

function createSubscriber(): Redis {
  if (config.REDIS_URL) {
    return new Redis(config.REDIS_URL, { keyPrefix: "" });
  }
  return new Redis({
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    keyPrefix: "",
  });
}

/**
 * Publish a command to the Discord Gateway via Redis.
 * The DG's commandHandler listens on "backend:command" channel.
 */
export async function publishCommand(
  payload: Record<string, unknown>,
): Promise<void> {
  const pub = getCommandPublisher();
  const envelope = {
    type: "command",
    data: payload,
    timestamp: Date.now(),
    source: "backend",
  };
  await pub.publish("backend:command", JSON.stringify(envelope));
  logger.debug({ payload }, "Published command to DG");
}

function handleSubscriptionMessage(channel: string, message: string): void {
  const mapping = SUBSCRIPTIONS.find((m) => m.channel === channel);
  if (!mapping) {
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

  logger.debug(
    { channel, eventType: mapping.eventType },
    "Broadcasting Redis event",
  );
  broadcastRaw(mapping.eventType, data);
}

/**
 * Handle binary messages from Redis (e.g. voice PCM data).
 * Expected format: 4-byte userId hash + PCM buffer
 */
function handleBinaryMessage(channel: Buffer, message: Buffer): void {
  const channelStr = channel.toString();

  if (channelStr === "discord:voice:pcm") {
    if (message.length < 4) {
      logger.warn(
        { channel: channelStr, size: message.length },
        "Received PCM message too short to contain userId",
      );
      return;
    }

    // First 4 bytes = userId hash, rest = PCM data
    const userIdHash = message.readUInt32LE(0);
    const pcmData = message.subarray(4);

    logger.debug(
      { channel: channelStr, userIdHash, pcmSize: pcmData.length },
      "Broadcasting voice PCM data",
    );

    // Broadcast as binary: userId (4 bytes) + PCM data
    broadcastRaw("voice_pcm", message);
  } else {
    logger.warn(
      { channel: channelStr },
      "Received binary message for unmapped channel",
    );
  }
}

export async function startRedisBridge(): Promise<void> {
  if (!config.REDIS_URL && !config.REDIS_HOST) {
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
    subscriber.on("messageBuffer", handleBinaryMessage);

    await subscriber.ping();
    logger.info("Redis ping OK");

    const channels = SUBSCRIPTIONS.map((m) => m.channel);
    await subscriber.subscribe(...channels);
    logger.info({ channels }, "Subscribed to Redis channels");

    if (BINARY_CHANNELS.length > 0) {
      await subscriber.subscribe(...BINARY_CHANNELS);
      logger.info({ channels: BINARY_CHANNELS }, "Subscribed to binary Redis channels");
    }

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
  } finally {
    subscriber.disconnect();
    subscriber = null;
  }
}
