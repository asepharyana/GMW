import { config } from "../../shared/config/config.js";
import { createChildLogger } from "../../shared/logger/logger.js";
import { uploadToTele } from "./teleUpload.js";
import {
  updateAttachmentAsFailedUpload,
  updateAttachmentAsUploaded,
  updateAttachmentDiscordUrl,
} from "../message-capture/messageStore.js";

const logger = createChildLogger("attachment-uploader");

class AttachmentDownloadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AttachmentDownloadError";
  }
}

export type RefreshDiscordAttachmentUrl = () => Promise<string | null>;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function shouldRefreshDiscordUrl(error: unknown): boolean {
  return (
    error instanceof AttachmentDownloadError &&
    (error.status === 403 || error.status === 404)
  );
}

export async function uploadAttachmentToTele(
  fileBuffer: Buffer,
  filename: string,
  contentType = "application/octet-stream",
): Promise<string> {
  try {
    const result = await uploadToTele({
      buffer: fileBuffer,
      filename,
      contentType,
      uploadUrl: config.TELE_UPLOAD_URL,
      timeoutMs: config.ATTACHMENT_UPLOAD_TIMEOUT_MS,
      retries: config.ATTACHMENT_RETRY_ATTEMPTS,
      logger,
    });

    return result.url;
  } catch (error) {
    logger.error(
      {
        filename,
        error: toErrorMessage(error),
      },
      "Failed to upload attachment",
    );
    throw error;
  }
}

export async function downloadDiscordAttachment(url: string): Promise<Buffer> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(config.ATTACHMENT_UPLOAD_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new AttachmentDownloadError(
        `Download failed with status ${response.status}`,
        response.status,
      );
    }

    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer);
  } catch (error) {
    logger.error(
      { url, error: toErrorMessage(error) },
      "Failed to download Discord attachment",
    );
    throw error;
  }
}

export async function processAttachmentUpload(
  attachmentId: string,
  discordUrl: string,
  filename: string,
  options: {
    refreshDiscordUrl?: RefreshDiscordAttachmentUrl;
    contentType?: string;
  } = {},
): Promise<void> {
  try {
    let currentDiscordUrl = discordUrl;
    let buffer: Buffer;
    try {
      buffer = await downloadDiscordAttachment(currentDiscordUrl);
    } catch (error) {
      if (!options.refreshDiscordUrl || !shouldRefreshDiscordUrl(error)) {
        throw error;
      }

      const freshUrl = await options.refreshDiscordUrl();
      if (!freshUrl) throw error;
      currentDiscordUrl = freshUrl;
      await updateAttachmentDiscordUrl(attachmentId, freshUrl);
      buffer = await downloadDiscordAttachment(currentDiscordUrl);
    }

    const sizeMb = buffer.length / (1024 * 1024);
    if (sizeMb > config.ATTACHMENT_MAX_SIZE_MB) {
      throw new Error(
        `File size ${sizeMb.toFixed(2)}MB exceeds limit of ${config.ATTACHMENT_MAX_SIZE_MB}MB`,
      );
    }

    const uploadedUrl = await uploadAttachmentToTele(
      buffer,
      filename,
      options.contentType,
    );

    await updateAttachmentAsUploaded(attachmentId, uploadedUrl, Date.now());
  } catch (error) {
    const errorMsg = toErrorMessage(error);
    await updateAttachmentAsFailedUpload(attachmentId, errorMsg);
    logger.error({ attachmentId, error: errorMsg }, "Attachment upload failed");
  }
}
