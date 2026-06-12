import { createChildLogger } from "@bete/shared/logger";
import type { Client, Message } from "discord.js-selfbot-v13";
import { config } from "../../shared/config/config.js";
import { queueMessageAnalysis } from "../ai-moderation/aiAnalyzer.js";
import { processAttachmentUpload } from "../attachment-upload/attachmentUploader.js";
import type { EventBroadcaster } from "../event-broadcaster/eventBroadcaster.js";
import {
  getDisplayContent,
  getMessageLocation,
  getMessageMetadata,
} from "../message-capture/messageMetadata.js";
import {
  getMessageById,
  insertAttachment,
  updateMessageAsDeleted,
  updateMessageAsEdited,
  upsertMessageForCapture,
} from "../message-capture/messageStore.js";
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

function isAgeRestrictedChannel(message: Message): boolean {
  try {
    const channel = message.channel as {
      nsfw?: boolean;
      nsfwLevel?: string | number | null;
      isThread?: () => boolean;
      parent?: { nsfw?: boolean; nsfwLevel?: string | number | null } | null;
    };
    if (channel.nsfw) return true;
    if (
      typeof channel.nsfwLevel === "string" &&
      channel.nsfwLevel.toUpperCase() === "AGE_RESTRICTED"
    )
      return true;
    if (channel.isThread?.() && channel.parent) {
      if (channel.parent.nsfw) return true;
      if (
        typeof channel.parent.nsfwLevel === "string" &&
        channel.parent.nsfwLevel.toUpperCase() === "AGE_RESTRICTED"
      )
        return true;
    }
  } catch {
    // Can't determine → allow capture
  }
  return false;
}

export function shouldCaptureMessageLocation(
  message: MessageLocationInput,
  target: TextCaptureTarget,
): boolean {
  if (
    message.channelId === "1310988070996414494" ||
    message.channelId === "1265679542144467035" ||
    message.channelId === "1310867899745046558" ||
    message.channelId === "1323365288447574128"
  )
    return false;
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
  const location = getMessageLocation(message);
  const messageRecord = buildMessageRecord(message, type);

  const inserted = await upsertMessageForCapture(messageRecord);
  if (!inserted) {
    return;
  }

  const isBacklog = options.source === "backlog";

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

      await insertAttachment(attachmentRecord);

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
      Promise.allSettled(attachmentUploadTasks).catch((err: unknown) => {
        logger.error(
          { messageId: message.id, error: err },
          "Attachment upload tasks failed",
        );
      });
    }
  }
}

export function registerMessageCapture(client: Client): void {
  client.on("messageCreate", async (message) => {
    if (!shouldCaptureMessageLocation(message, getTextCaptureTarget())) return;
    if (message.author?.bot) return;
    if (isAgeRestrictedChannel(message)) return;

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
    if (!shouldCaptureMessageLocation(newMessage, getTextCaptureTarget()))
      return;
    if (newMessage.author?.bot) return;
    if (isAgeRestrictedChannel(newMessage as Message)) return;

    try {
      const existing = await getMessageById(newMessage.id);

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
        await updateMessageAsEdited(
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
    if (!shouldCaptureMessageLocation(message, getTextCaptureTarget())) return;
    if (!message.author) return;

    try {
      const deletedAt = Date.now();
      await updateMessageAsDeleted(message.id, deletedAt);

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
