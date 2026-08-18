import Redis from "ioredis";
import type { AttachmentRecord, MessageRecord } from "../../shared/index.js";
import {
  type CustomLogger,
  createChildLogger,
} from "../../shared/logger/index.js";
import { type DiscordGatewayEvent, EventChannels } from "./eventTypes.js";

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
  private logger = createChildLogger("event-broadcaster");

  constructor(publisher: RedisEventPublisher) {
    this.publisher = publisher;
  }

  async messageCreated(data: MessageRecord): Promise<void> {
    this.logger.debug({ data }, "Publishing message_created");
    await this.publisher.publish(EventChannels.MESSAGE_CREATED, {
      type: "message_created",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async messageUpdated(
    data: Partial<MessageRecord> & { id: string },
  ): Promise<void> {
    this.logger.debug({ data }, "Publishing message_updated");
    await this.publisher.publish(EventChannels.MESSAGE_UPDATED, {
      type: "message_updated",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async messageDeleted(data: {
    id: string;
    deleted_at: number;
  }): Promise<void> {
    this.logger.debug({ data }, "Publishing message_deleted");
    await this.publisher.publish(EventChannels.MESSAGE_DELETED, {
      type: "message_deleted",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async messageAnalyzed(data: MessageRecord): Promise<void> {
    this.logger.debug({ data }, "Publishing message_analyzed");
    await this.publisher.publish(EventChannels.MESSAGE_ANALYZED, {
      type: "message_analyzed",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async attachmentCreated(data: AttachmentRecord): Promise<void> {
    this.logger.debug({ data }, "Publishing attachment_created");
    await this.publisher.publish(EventChannels.ATTACHMENT_CREATED, {
      type: "attachment_created",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async attachmentUploaded(data: AttachmentRecord): Promise<void> {
    this.logger.debug({ data }, "Publishing attachment_uploaded");
    await this.publisher.publish(EventChannels.ATTACHMENT_UPLOADED, {
      type: "attachment_uploaded",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async voiceRecordingStarted(data: Record<string, unknown>): Promise<void> {
    this.logger.debug({ data }, "Publishing voice_recording_started");
    await this.publisher.publish(EventChannels.VOICE_STARTED, {
      type: "voice_recording_started",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async voiceRecordingStopped(data: Record<string, unknown>): Promise<void> {
    this.logger.debug({ data }, "Publishing voice_recording_stopped");
    await this.publisher.publish(EventChannels.VOICE_STOPPED, {
      type: "voice_recording_stopped",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async voiceRecordingUploaded(data: Record<string, unknown>): Promise<void> {
    this.logger.debug({ data }, "Publishing voice_recording_uploaded");
    await this.publisher.publish(EventChannels.VOICE_UPLOADED, {
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
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    this.logger.debug(
      { userId, pcmSize: pcmBuffer.length },
      "Publishing voice_pcm_data",
    );
    await this.publisher.publish(EventChannels.VOICE_PCM, {
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
    this.logger.debug(
      { userId, speaking: data.speaking },
      "Publishing voice_active_user",
    );
    await this.publisher.publish(EventChannels.VOICE_ACTIVE_USER, {
      type: "voice_active_user",
      data: {
        userId,
        ...data,
      },
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async reactionAdded(data: Record<string, unknown>): Promise<void> {
    this.logger.debug({ data }, "Publishing reaction_added");
    await this.publisher.publish(EventChannels.REACTION_ADDED, {
      type: "reaction_added",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async reactionRemoved(data: Record<string, unknown>): Promise<void> {
    this.logger.debug({ data }, "Publishing reaction_removed");
    await this.publisher.publish(EventChannels.REACTION_REMOVED, {
      type: "reaction_removed",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async threadCreated(data: Record<string, unknown>): Promise<void> {
    this.logger.debug({ data }, "Publishing thread_created");
    await this.publisher.publish(EventChannels.THREAD_CREATED, {
      type: "thread_created",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async threadDeleted(data: Record<string, unknown>): Promise<void> {
    this.logger.debug({ data }, "Publishing thread_deleted");
    await this.publisher.publish(EventChannels.THREAD_DELETED, {
      type: "thread_deleted",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async threadUpdated(data: Record<string, unknown>): Promise<void> {
    this.logger.debug({ data }, "Publishing thread_updated");
    await this.publisher.publish(EventChannels.THREAD_UPDATED, {
      type: "thread_updated",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async channelTopicUpdated(data: Record<string, unknown>): Promise<void> {
    this.logger.debug({ data }, "Publishing channel_topic_updated");
    await this.publisher.publish(EventChannels.CHANNEL_TOPIC_UPDATED, {
      type: "channel_topic_updated",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async presenceUpdated(data: Record<string, unknown>): Promise<void> {
    this.logger.debug({ data }, "Publishing presence_updated");
    await this.publisher.publish(EventChannels.PRESENCE_UPDATED, {
      type: "presence_updated",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async guildMemberAdded(data: Record<string, unknown>): Promise<void> {
    this.logger.debug({ data }, "Publishing guild_member_added");
    await this.publisher.publish(EventChannels.GUILD_MEMBER_ADDED, {
      type: "guild_member_added",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async guildMemberRemoved(data: Record<string, unknown>): Promise<void> {
    this.logger.debug({ data }, "Publishing guild_member_removed");
    await this.publisher.publish(EventChannels.GUILD_MEMBER_REMOVED, {
      type: "guild_member_removed",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async voiceAnalyzed(data: Record<string, unknown>): Promise<void> {
    this.logger.debug({ data }, "Publishing voice_analyzed");
    await this.publisher.publish(EventChannels.VOICE_ANALYZED, {
      type: "voice_analyzed",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async moderationAction(data: Record<string, unknown>): Promise<void> {
    this.logger.debug({ data }, "Publishing moderation_action");
    await this.publisher.publish(EventChannels.MODERATION_ACTION, {
      type: "moderation_action",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async analysisQueueStatus(data: Record<string, unknown>): Promise<void> {
    this.logger.debug({ data }, "Publishing analysis_queue_status");
    await this.publisher.publish(EventChannels.ANALYSIS_QUEUE_STATUS, {
      type: "analysis_queue_status",
      data,
      timestamp: Date.now(),
      source: "discord-gateway",
    });
  }

  async close(): Promise<void> {
    this.logger.debug("Closing event broadcaster");
    await this.publisher.close();
  }
}
