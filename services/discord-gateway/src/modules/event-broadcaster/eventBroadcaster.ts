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
  private logger: CustomLogger;

  constructor(publisher: RedisEventPublisher, logger: CustomLogger) {
    this.publisher = publisher;
    this.logger = logger;
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
