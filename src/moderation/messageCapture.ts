import type { Client, Message } from "discord.js-selfbot-v13";
import { config } from "../config.js";
import { createChildLogger } from "../logger.js";
import { getModerationBroadcaster } from "../ws/broadcastGlobals.js";
import { queueMessageAnalysis } from "./aiAnalyzer.js";
import { processAttachmentUpload } from "./attachmentUploader.js";
import {
  getDisplayContent,
  getMessageLocation,
  getMessageMetadata,
} from "./messageMetadata.js";
import {
  getMessageById,
  insertAttachment,
  updateMessageAsDeleted,
  updateMessageAsEdited,
  upsertMessageForCapture,
} from "./messageStore.js";
import type { AttachmentRecord, MessageRecord } from "./types.js";

const logger = createChildLogger("message-capture");

export interface TextCaptureTarget {
  guildId?: string;
  channelId?: string;
}

export interface MessageLocationInput {
  guildId?: string | null;
  channelId?: string | null;
}

export function shouldCaptureMessageLocation(
  message: MessageLocationInput,
  target: TextCaptureTarget,
): boolean {
  if (
    message.channelId === "1310988070996414494" ||
    message.channelId === "1265679542144467035"
  )
    return false; // Skip specific channels
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

function buildMessageRecord(
  message: Message,
  type: "text" | "edited" | "deleted",
): MessageRecord {
  const location = getMessageLocation(message);
  const metadata = getMessageMetadata(message);

  return {
    id: message.id,
    guild_id: message.guildId!,
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
  return {
    id: attachment.id,
    message_id: message.id,
    guild_id: message.guildId!,
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

  const broadcaster = getModerationBroadcaster();
  if (broadcaster && !isBacklog) {
    broadcaster.messageCreated(messageRecord);
  }

  const attachmentUploadTasks: Promise<void>[] = [];

  // Insert attachments before queuing analysis to avoid race condition
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

      // Initiate async upload (non-blocking, fire-and-forget)
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
          ).catch((err) => {
            logger.error(
              { attachmentId: attachment.id, error: err },
              "Failed to initiate attachment upload",
            );
          }),
        );
      }

      if (broadcaster) {
        broadcaster.attachmentCreated(attachmentRecord);
      }
    }
  }

  // Queue analysis after attachment uploads settle so AI uses stable tele URLs.
  if (!isBacklog) {
    if (attachmentUploadTasks.length > 0) {
      let analysisQueued = false;
      let fallbackTimer: NodeJS.Timeout | null = null;
      const queueAnalysisOnce = () => {
        if (analysisQueued) return;
        analysisQueued = true;
        if (fallbackTimer) {
          clearTimeout(fallbackTimer);
          fallbackTimer = null;
        }
        queueMessageAnalysis(message.id);
      };

      fallbackTimer = setTimeout(queueAnalysisOnce, 30000);
      Promise.allSettled(attachmentUploadTasks)
        .then(queueAnalysisOnce)
        .catch((err) => {
          logger.error(
            { messageId: message.id, error: err },
            "Failed to queue message analysis after attachment upload",
          );
          queueAnalysisOnce();
        });
    } else {
      queueMessageAnalysis(message.id);
    }
  }
}

export function registerMessageCapture(client: Client): void {
  client.on("messageCreate", async (message) => {
    if (!shouldCaptureMessageLocation(message, getTextCaptureTarget())) return;
    if (message.author?.bot) return;

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

    try {
      const existing = await getMessageById(newMessage.id);

      if (existing) {
        const editedAt = Date.now();
        await updateMessageAsEdited(
          newMessage.id,
          getDisplayContent(newMessage as Message),
          editedAt,
        );
        queueMessageAnalysis(newMessage.id);

        const broadcaster = getModerationBroadcaster();
        if (broadcaster) {
          broadcaster.messageUpdated({
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

      const broadcaster = getModerationBroadcaster();
      if (broadcaster) {
        broadcaster.messageDeleted({
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
