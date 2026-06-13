import {
  DISCORD_ANALYSIS_QUEUE_STATUS,
  DISCORD_ATTACHMENT_CREATED,
  DISCORD_ATTACHMENT_UPLOADED,
  DISCORD_CHANNEL_TOPIC_UPDATED,
  DISCORD_GUILD_MEMBER_ADDED,
  DISCORD_GUILD_MEMBER_REMOVED,
  DISCORD_MESSAGE_ANALYZED,
  DISCORD_MESSAGE_CREATED,
  DISCORD_MESSAGE_DELETED,
  DISCORD_MESSAGE_UPDATED,
  DISCORD_PRESENCE_UPDATED,
  DISCORD_REACTION_ADDED,
  DISCORD_REACTION_REMOVED,
  DISCORD_THREAD_CREATED,
  DISCORD_THREAD_DELETED,
  DISCORD_THREAD_UPDATED,
  DISCORD_VOICE_ACTIVE_USER,
  DISCORD_VOICE_ANALYZED,
  DISCORD_VOICE_PCM,
  DISCORD_VOICE_STARTED,
  DISCORD_VOICE_STOPPED,
  DISCORD_VOICE_UPLOADED,
} from "@bete/shared";
import { createChildLogger } from "@bete/shared/logger";
import Redis from "ioredis";
import { config } from "../shared/config/index.js";
import { broadcastBinary, broadcastEvent } from "./broadcast.js";

const logger = createChildLogger("ws.redis-bridge");

interface ChannelMapping {
  channel: string;
  eventType: string;
}

const SUBSCRIPTIONS: ChannelMapping[] = [
  { channel: DISCORD_MESSAGE_CREATED, eventType: "message_created" },
  { channel: DISCORD_MESSAGE_UPDATED, eventType: "message_updated" },
  { channel: DISCORD_MESSAGE_DELETED, eventType: "message_deleted" },
  { channel: DISCORD_MESSAGE_ANALYZED, eventType: "message_analyzed" },
  { channel: DISCORD_ATTACHMENT_CREATED, eventType: "attachment_created" },
  { channel: DISCORD_ATTACHMENT_UPLOADED, eventType: "attachment_uploaded" },
  { channel: DISCORD_VOICE_STARTED, eventType: "voice_recording_started" },
  { channel: DISCORD_VOICE_STOPPED, eventType: "voice_recording_stopped" },
  { channel: DISCORD_VOICE_UPLOADED, eventType: "voice_recording_uploaded" },
  {
    channel: DISCORD_ANALYSIS_QUEUE_STATUS,
    eventType: "analysis_queue_status",
  },
  { channel: DISCORD_VOICE_ACTIVE_USER, eventType: "voice_active_user" },
  { channel: DISCORD_VOICE_PCM, eventType: "voice_pcm_data" },
  { channel: DISCORD_VOICE_ANALYZED, eventType: "voice_analyzed" },
  { channel: DISCORD_REACTION_ADDED, eventType: "reaction_added" },
  { channel: DISCORD_REACTION_REMOVED, eventType: "reaction_removed" },
  { channel: DISCORD_THREAD_CREATED, eventType: "thread_created" },
  { channel: DISCORD_THREAD_DELETED, eventType: "thread_deleted" },
  { channel: DISCORD_THREAD_UPDATED, eventType: "thread_updated" },
  {
    channel: DISCORD_CHANNEL_TOPIC_UPDATED,
    eventType: "channel_topic_updated",
  },
  { channel: DISCORD_PRESENCE_UPDATED, eventType: "presence_updated" },
  { channel: DISCORD_GUILD_MEMBER_ADDED, eventType: "guild_member_added" },
  { channel: DISCORD_GUILD_MEMBER_REMOVED, eventType: "guild_member_removed" },
];

let subscriber: Redis | null = null;

function createSubscriber(): Redis {
  return new Redis(config.REDIS_URL, { keyPrefix: "" });
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

  // Voice PCM: decode base64 → binary broadcast instead of JSON
  if (mapping.eventType === "voice_pcm_data") {
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

  logger.debug(
    { channel, eventType: mapping.eventType },
    "Broadcasting Redis event",
  );
  broadcastEvent(mapping.eventType, data);
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

    const channels = SUBSCRIPTIONS.map((m) => m.channel);
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
  } finally {
    subscriber.disconnect();
    subscriber = null;
  }
}
