import type { CustomLogger } from "@bete/shared/logger";
import Redis from "ioredis";

export interface DiscordGatewayEvent {
  type: string;
  data: unknown;
  timestamp: number;
  source: string;
}

export class RedisEventPublisher {
  private redis: Redis;
  private logger: CustomLogger;

  constructor(redisUrl: string, logger: CustomLogger) {
    this.redis = new Redis(redisUrl);
    this.logger = logger;

    this.redis.on("error", (err) => {
      this.logger.error({ error: err }, "Redis connection error");
    });

    this.redis.on("connect", () => {
      this.logger.info("Redis connected");
    });
  }

  async publish(channel: string, event: DiscordGatewayEvent): Promise<void> {
    try {
      await this.redis.publish(channel, JSON.stringify(event));
    } catch (error) {
      this.logger.error(
        { error, channel, eventType: event.type },
        "Failed to publish event",
      );
    }
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

export class EventBroadcaster {
  private publisher: RedisEventPublisher;

  constructor(publisher: RedisEventPublisher) {
    this.publisher = publisher;
  }

  async messageCreated(data: unknown): Promise<void> {
    await this.publisher.publish("discord:message:created", {
      type: "message_created",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async messageUpdated(data: unknown): Promise<void> {
    await this.publisher.publish("discord:message:updated", {
      type: "message_updated",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async messageDeleted(data: unknown): Promise<void> {
    await this.publisher.publish("discord:message:deleted", {
      type: "message_deleted",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async messageAnalyzed(data: unknown): Promise<void> {
    await this.publisher.publish("discord:message:analyzed", {
      type: "message_analyzed",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async attachmentCreated(data: unknown): Promise<void> {
    await this.publisher.publish("discord:attachment:created", {
      type: "attachment_created",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async attachmentUploaded(data: unknown): Promise<void> {
    await this.publisher.publish("discord:attachment:uploaded", {
      type: "attachment_uploaded",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async voiceRecordingStarted(data: unknown): Promise<void> {
    await this.publisher.publish("discord:voice:started", {
      type: "voice_recording_started",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async voiceRecordingStopped(data: unknown): Promise<void> {
    await this.publisher.publish("discord:voice:stopped", {
      type: "voice_recording_stopped",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async voiceRecordingUploaded(data: unknown): Promise<void> {
    await this.publisher.publish("discord:voice:uploaded", {
      type: "voice_recording_uploaded",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  /**
   * Broadcasts PCM audio data for real-time voice streaming
   * @param pcmBuffer - Raw PCM audio buffer
   * @param userId - Discord user ID
   * @param metadata - Optional metadata about the audio chunk
   */
  async voicePcmData(
    pcmBuffer: Buffer,
    userId: string,
    metadata?: any,
  ): Promise<void> {
    await this.publisher.publish("discord:voice:pcm", {
      type: "voice_pcm_data",
      data: {
        userId,
        pcm: pcmBuffer.toString("base64"),
        metadata,
      },
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  /**
   * Broadcasts voice user activity state changes
   * @param userId - Discord user ID
   * @param data - User state data including username, avatar, and speaking status
   */
  async voiceActiveUser(
    userId: string,
    data: { username: string; avatar: string; speaking: boolean },
  ): Promise<void> {
    await this.publisher.publish("discord:voice:active_user", {
      type: "voice_active_user",
      data: {
        userId,
        ...data,
      },
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async analysisQueueStatus(data: unknown): Promise<void> {
    await this.publisher.publish("discord:analysis:queue_status", {
      type: "analysis_queue_status",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async close(): Promise<void> {
    await this.publisher.close();
  }
}
