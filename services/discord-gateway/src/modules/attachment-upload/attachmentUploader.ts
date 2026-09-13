import { createChildLogger } from "@/shared/logger/index";
import { retryWithBackoff } from "@/shared/utils/index";
import { config } from "../../shared/config/config.js";
import { uploadToTele } from "../../shared/uploader.js";
import { messageStore } from "../message-capture/messageStore.js";

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
  logger.debug(
    { filename, sizeBytes: fileBuffer.length },
    "Starting attachment upload to tele",
  );
  try {
    const result = await uploadToTele({
      buffer: fileBuffer,
      filename,
      contentType,
      uploadUrl: config.TELE_UPLOAD_URL,
      timeoutMs: config.ATTACHMENT_UPLOAD_TIMEOUT_MS,
      // Tele 5xx under load is transient (prod: 12x Status 500) — retry
      // inside uploadToTele instead of failing the attachment outright.
      retries: config.ATTACHMENT_RETRY_ATTEMPTS,
    });

    logger.info(
      { filename, url: result.url },
      "Attachment uploaded to tele successfully",
    );
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

export async function downloadDiscordAttachment(
  url: string,
  timeoutMs?: number,
): Promise<Buffer> {
  const timeout = timeoutMs ?? config.ATTACHMENT_UPLOAD_TIMEOUT_MS;
  logger.debug({ url }, "Starting Discord attachment download");
  try {
    // Timeout-only retry: a CDN abort mid-download is transient (the prod
    // failure signature is "The operation was aborted due to timeout").
    // 403/404 = expired or purged URL — not retried here; the caller
    // refreshes via refreshDiscordUrl instead.
    const response = await retryWithBackoff(
      () =>
        fetch(url, {
          signal: AbortSignal.timeout(timeout),
        }),
      {
        retries: config.ATTACHMENT_RETRY_ATTEMPTS,
        minTimeout: 1000,
        maxTimeout: 8000,
      },
    );

    if (!response.ok) {
      throw new AttachmentDownloadError(
        `Download failed with status ${response.status}`,
        response.status,
      );
    }

    const buffer = await response.arrayBuffer();
    const result = Buffer.from(buffer);
    logger.debug(
      { url, sizeBytes: result.length },
      "Discord attachment downloaded successfully",
    );
    return result;
  } catch (error) {
    if (error instanceof AttachmentDownloadError) throw error;
    // retryWithBackoff rethrows AbortError unwrapped — normalize it to a
    // plain Error so shouldRefreshDiscordUrl() never mistakes a timeout
    // for an expired URL (which would trigger a useless refresh fetch).
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Download timed out: ${toErrorMessage(error)}`);
    }
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
  logger.info({ attachmentId, filename }, "processAttachmentUpload called");
  try {
    let currentDiscordUrl = discordUrl;
    let buffer: Buffer;
    try {
      buffer = await downloadDiscordAttachment(currentDiscordUrl);
    } catch (error) {
      if (!options.refreshDiscordUrl || !shouldRefreshDiscordUrl(error)) {
        throw error;
      }

      logger.warn(
        { attachmentId, filename },
        "Discord URL expired, refreshing and retrying",
      );
      const freshUrl = await options.refreshDiscordUrl();
      if (!freshUrl) throw error;
      currentDiscordUrl = freshUrl;
      await messageStore.updateAttachmentDiscordUrl(attachmentId, freshUrl);
      buffer = await downloadDiscordAttachment(currentDiscordUrl);
    }

    const sizeMb = buffer.length / (1024 * 1024);
    logger.debug(
      { attachmentId, sizeMb: sizeMb.toFixed(2) },
      "Attachment size check",
    );
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

    await messageStore.updateAttachmentAsUploaded(
      attachmentId,
      uploadedUrl,
      Date.now(),
    );
    logger.info(
      { attachmentId, url: uploadedUrl },
      "Attachment upload completed successfully",
    );
  } catch (error) {
    const errorMsg = toErrorMessage(error);
    await messageStore.updateAttachmentAsFailedUpload(attachmentId, errorMsg);
    logger.error({ attachmentId, error: errorMsg }, "Attachment upload failed");
  }
}
