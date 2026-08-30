import type { Client, Message } from "discord.js-selfbot-v13";
import { createChildLogger } from "@/shared/logger/index";
import { config } from "../../shared/config/config.js";
import { queueMessageAnalysis } from "../ai-moderation/aiAnalyzer.js";
import { processAttachmentUpload } from "../attachment-upload/attachmentUploader.js";
import type { EventBroadcaster } from "../event-broadcaster/eventBroadcaster.js";
import { archiveMessageEmbedded } from "../message-capture/archiveEmbedder.js";
import {
  getDisplayContent,
  getMessageLocation,
  getMessageMetadata,
  isAgeRestrictedMessage,
} from "../message-capture/messageMetadata.js";
import { messageStore } from "../message-capture/messageStore.js";
import type {
  AttachmentRecord,
  MessageRecord,
} from "../message-capture/types.js";

const logger = createChildLogger("message-capture");

let _eventBroadcaster: EventBroadcaster | undefined;

export function setEventBroadcaster(broadcaster: EventBroadcaster | undefined) {
  _eventBroadcaster = broadcaster;
}

export interface TextCaptureTarget {
  guildId?: string;
  channelId?: string;
}

export interface MessageLocationInput {
  guildId?: string | null;
  channelId?: string | null;
}

const EXCLUDED_CHANNEL_IDS = new Set(config.EXCLUDED_CHANNEL_IDS);
const BOT_EXCLUDED_CHANNEL_IDS = new Set(config.BOT_EXCLUDED_CHANNEL_IDS);

function isBotExcludedChannel(message: Message): boolean {
  if (!message.author?.bot) return false;
  const id = getParentChannelId(message) ?? message.channelId;
  return id != null && BOT_EXCLUDED_CHANNEL_IDS.has(id);
}
const EXCLUDED_THREAD_IDS = new Set(config.EXCLUDED_THREAD_IDS);

function isExcludedThread(message: {
  channel?: { isThread?: () => boolean; id?: string };
}): boolean {
  return (
    message.channel?.isThread?.() === true &&
    typeof message.channel.id === "string" &&
    EXCLUDED_THREAD_IDS.has(message.channel.id)
  );
}

function getParentChannelId(
  message: MessageLocationInput,
): string | null | undefined {
  try {
    const m = message as {
      channel?: { isThread?: () => boolean; parentId?: string };
    };
    if (m.channel?.isThread?.() && m.channel.parentId)
      return m.channel.parentId;
  } catch {
    // Not a thread or can't resolve — fall back to channelId
  }
  return null;
}

export function shouldCaptureMessageLocation(
  message: MessageLocationInput,
  target: TextCaptureTarget,
): boolean {
  const effectiveId = getParentChannelId(message) ?? message.channelId;
  if (effectiveId && EXCLUDED_CHANNEL_IDS.has(effectiveId)) return false;
  if (!message.guildId || message.guildId !== target.guildId) return false;
  if (target.channelId && message.channelId !== target.channelId) return false;
  return true;
}

function getTextCaptureTarget(): TextCaptureTarget {
  return {
    guildId: config.EFFECTIVE_TEXT_GUILD_ID,
    channelId: config.TEXT_CHANNEL_ID,
  };
}

function getTextCaptureTargets(): TextCaptureTarget[] {
  const { EFFECTIVE_MONITOR_GUILD_IDS, TEXT_CHANNEL_ID } = config;
  if (EFFECTIVE_MONITOR_GUILD_IDS?.length) {
    if (TEXT_CHANNEL_ID) {
      return EFFECTIVE_MONITOR_GUILD_IDS.map((guildId: string) => ({
        guildId,
        channelId: TEXT_CHANNEL_ID,
      }));
    }
    return EFFECTIVE_MONITOR_GUILD_IDS.map((guildId: string) => ({ guildId }));
  }
  // Fallback
  const target = getTextCaptureTarget();
  return target.guildId ? [target] : [];
}

function shouldCaptureForAnyTarget(
  message: MessageLocationInput,
  targets: TextCaptureTarget[],
): boolean {
  if (targets.length === 0) return false;
  return targets.some((target) =>
    shouldCaptureMessageLocation(message, target),
  );
}

function requireMessageGuildId(message: Message): string {
  if (!message.guildId) {
    throw new Error(`Message ${message.id} is missing guildId`);
  }
  return message.guildId;
}

function buildMessageRecord(
  message: Message,
  type: "text" | "edited" | "deleted",
): MessageRecord {
  const location = getMessageLocation(message);
  const metadata = getMessageMetadata(message);
  const guildId = requireMessageGuildId(message);
  const ref = message.reference;

  // is_reply: type === 'REPLY' OR reference type === 'DEFAULT'
  // is_forward: reference type === 'FORWARD'
  // is_crosspost: message flags has CROSSPOSTED
  const msgType = message.type as string;
  const refType = (ref?.type as string | undefined) ?? null;
  const isReply =
    msgType === "REPLY" || (refType === "DEFAULT" && msgType !== "FORWARD")
      ? true
      : null;
  const isForward = refType === "FORWARD" ? true : null;
  const isCrosspost =
    message.flags?.has(1 << 1) || msgType === "CROSSPOSTED" ? true : null;

  return {
    id: message.id,
    guild_id: guildId,
    channel_id: location.channelId,
    thread_id: location.threadId,
    user_id: message.author?.id,
    username: message.author?.username,
    avatar_url: message.author?.avatarURL() || null,
    content: getDisplayContent(message),
    edited_content: null,
    created_at: message.createdTimestamp,
    edited_at: null,
    deleted_at: null,
    type,
    is_reply: isReply,
    is_forward: isForward,
    is_crosspost: isCrosspost,
    reference_message_id: ref?.messageId ?? null,
    reference_channel_id: ref?.channelId ?? null,
    reference_guild_id: ref?.guildId ?? null,
    metadata: JSON.stringify(metadata),
  };
}

function buildAttachmentRecord(
  message: Message,
  location: ReturnType<typeof getMessageLocation>,
  attachment: {
    id: string;
    name: string | null;
    size: number;
    contentType: string | null;
    url: string;
  },
): AttachmentRecord {
  const guildId = requireMessageGuildId(message);

  return {
    id: attachment.id,
    message_id: message.id,
    guild_id: guildId,
    channel_id: location.channelId,
    thread_id: location.threadId,
    user_id: message.author?.id,
    filename: attachment.name || "unknown",
    size: attachment.size,
    type: attachment.contentType || "application/octet-stream",
    discord_url: attachment.url,
    uploaded_url: null,
    upload_status: "pending",
    upload_error: null,
    created_at: Date.now(),
    uploaded_at: null,
  };
}

export async function captureMessage(
  message: Message,
  type: "text" | "edited" | "deleted",
  options: { source?: "live" | "backlog" } = {},
): Promise<void> {
  const isBacklog = options.source === "backlog";
  const location = getMessageLocation(message);
  const messageRecord = buildMessageRecord(message, type);

  const inserted = await messageStore.upsertMessageForCapture(messageRecord);
  if (!inserted) {
    return;
  }

  // Fire-and-forget: make the captured message searchable in the persistent
  // archive (public semantic search). Never blocks capture/moderation.
  // NSFW/age-restricted messages are kept OUT of the public archive.
  if (!isBacklog && messageRecord.content) {
    archiveMessageEmbedded({
      ...messageRecord,
      isAgeRestricted: isAgeRestrictedMessage(message),
    });
  }

  if (_eventBroadcaster && !isBacklog) {
    _eventBroadcaster.messageCreated(messageRecord);
  }

  const attachmentUploadTasks: Promise<void>[] = [];

  if (message.attachments.size > 0) {
    for (const [, attachment] of message.attachments) {
      const attachmentRecord = buildAttachmentRecord(message, location, {
        id: attachment.id,
        name: attachment.name,
        size: attachment.size,
        contentType: attachment.contentType,
        url: attachment.url,
      });

      await messageStore.insertAttachment(attachmentRecord);

      if (!isBacklog) {
        attachmentUploadTasks.push(
          processAttachmentUpload(
            attachment.id,
            attachment.url,
            attachment.name || "unknown",
            {
              contentType: attachment.contentType ?? undefined,
              refreshDiscordUrl: async () => {
                const freshMessage = await message.channel.messages.fetch(
                  message.id,
                );
                const freshAttachment = freshMessage.attachments.get(
                  attachment.id,
                );
                return freshAttachment?.url ?? null;
              },
            },
          ).catch((err: unknown) => {
            logger.error(
              { attachmentId: attachment.id, error: err },
              "Failed to initiate attachment upload",
            );
          }),
        );
      }

      if (_eventBroadcaster) {
        _eventBroadcaster.attachmentCreated(attachmentRecord);
      }
    }
  }

  if (!isBacklog) {
    // AI analysis starts immediately — attachment upload runs in parallel.
    // Media analysis path downloads images directly from Discord CDN,
    // so it does NOT depend on the upload completing first.
    queueMessageAnalysis(message.id);

    if (attachmentUploadTasks.length > 0) {
      await Promise.allSettled(attachmentUploadTasks);
    }
  }
}

export function registerMessageCapture(client: Client): void {
  const targets = getTextCaptureTargets();

  client.on("messageCreate", async (message) => {
    if (!shouldCaptureForAnyTarget(message, targets)) return;
    if (isBotExcludedChannel(message)) return;
    if (isExcludedThread(message)) return;

    try {
      await captureMessage(message, "text");
    } catch (error) {
      logger.error(
        {
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to capture message",
      );
    }
  });

  client.on("messageUpdate", async (_oldMessage, newMessage) => {
    if (!shouldCaptureForAnyTarget(newMessage, targets)) return;
    if (isBotExcludedChannel(newMessage as Message)) return;
    if (isExcludedThread(newMessage)) return;

    try {
      const existing = await messageStore.getMessageById(newMessage.id);

      if (existing) {
        const newContent = getDisplayContent(newMessage as Message);
        const existingContent = existing.edited_content ?? existing.content;

        // Skip if the displayed text is identical — Discord fires `messageUpdate`
        // for embed resolution (link previews) which does NOT change the message
        // body. Re-setting ai_status + re-queuing LLM in that case wastes a call
        // and risks overwriting a valid completed analysis with a duplicate.
        if (newContent === existingContent) {
          logger.debug(
            { messageId: newMessage.id },
            "messageUpdate skipped: content unchanged (embed resolution or no-op)",
          );
          return;
        }

        const editedAt = Date.now();
        const oldContent = existing.edited_content ?? existing.content ?? "";

        // Save edit history snapshot before overwriting
        if (oldContent) {
          messageStore
            .insertMessageEdit(newMessage.id, oldContent, editedAt)
            .catch((err: unknown) => {
              logger.error(
                { messageId: newMessage.id, error: err },
                "Failed to save edit history",
              );
            });
        }

        await messageStore.updateMessageAsEdited(
          newMessage.id,
          getDisplayContent(newMessage as Message),
          editedAt,
        );
        queueMessageAnalysis(newMessage.id);

        if (_eventBroadcaster) {
          _eventBroadcaster.messageUpdated({
            id: newMessage.id,
            edited_content: getDisplayContent(newMessage as Message),
            edited_at: editedAt,
            type: "edited",
            // Match the DB update (updateMessageAsEdited resets analysis to
            // pending) so the live UI reflects the same state instead of
            // lingering on the stale pre-edit verdict.
            ai_status: "pending",
            ai_moderation_flags: null,
            ai_moderation_score: null,
            ai_analysis: null,
            ai_categories: null,
            ai_severity: null,
            ai_confidence: null,
            ai_recommended_action: null,
            ai_analyzed_at: null,
            ai_error: null,
          });
        }
      } else if (newMessage.author) {
        await captureMessage(newMessage as Message, "text");
      }
    } catch (error) {
      logger.error(
        {
          messageId: newMessage.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to capture message update",
      );
    }
  });

  client.on("messageDelete", async (message) => {
    if (!shouldCaptureForAnyTarget(message, targets)) return;
    if (!message.author) return;
    if (isExcludedThread(message)) return;

    try {
      const deletedAt = Date.now();
      await messageStore.updateMessageAsDeleted(message.id, deletedAt);

      if (_eventBroadcaster) {
        _eventBroadcaster.messageDeleted({
          id: message.id,
          deleted_at: deletedAt,
        });
      }
    } catch (error) {
      logger.error(
        {
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to capture message deletion",
      );
    }
  });
}
