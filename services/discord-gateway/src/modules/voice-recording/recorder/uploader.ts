import fs from "node:fs";
import path from "node:path";
import { createChildLogger } from "@bete/shared/logger";
import { config } from "../../../shared/config/config.js";
import {
  insertVoiceRecording,
  updateVoiceRecordingAsFailed,
  updateVoiceRecordingAsUploaded,
} from "../../../shared/database/voiceRecordingRepo.js";
import { uploadToTele } from "../teleUpload.js";

const logger = createChildLogger("recording-uploader");

/**
 * Uploads a recorded segment OGG file to external server and registers in database
 */
export async function uploadRecordingSegment(input: {
  id: string;
  oggPath: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
  guildId: string | null;
  channelId: string | null;
  channelName: string | null;
}): Promise<void> {
  const {
    id,
    oggPath,
    userId,
    username,
    avatarUrl,
    guildId,
    channelId,
    channelName,
  } = input;
  const fileName = path.basename(oggPath);

  try {
    // 1. Get file size and insert initial pending state to DB
    const stats = await fs.promises.stat(oggPath);
    await insertVoiceRecording({
      id,
      user_id: userId,
      username,
      avatar_url: avatarUrl,
      guild_id: guildId,
      channel_id: channelId,
      channel_name: channelName,
      filename: fileName,
      size_bytes: stats.size,
      upload_status: "pending",
      created_at: Date.now(),
    });

    // 2. Perform async upload with retry logic
    const fileBuffer = await fs.promises.readFile(oggPath);
    const uploadResult = await uploadToTele({
      buffer: fileBuffer,
      filename: fileName,
      contentType: "audio/ogg",
      uploadUrl: config.TELE_UPLOAD_URL,
      retries: 0,
    });
    const downloadUrl = uploadResult.url;

    // 3. Update DB to uploaded state
    await updateVoiceRecordingAsUploaded(id, downloadUrl, Date.now());
    logger.info({ id, downloadUrl }, "Recording segment uploaded successfully");

    // 4. Broadcast via Redis EventBroadcaster (forwarded to WebSocket clients by backend)
    const { _eventBroadcaster } = await import("../recorder.js");
    if (_eventBroadcaster) {
      _eventBroadcaster
        .voiceRecordingUploaded({
          id,
          user_id: userId,
          username,
          avatar_url: avatarUrl,
          guild_id: guildId,
          channel_id: channelId,
          channel_name: channelName,
          filename: fileName,
          size_bytes: stats.size,
          download_url: downloadUrl,
          upload_status: "uploaded",
          created_at: Date.now(),
          uploaded_at: Date.now(),
        })
        .catch((err: unknown) => {
          logger.warn(
            { err },
            "Failed to broadcast voice recording upload event",
          );
        });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ id, error: errorMsg }, "Failed to upload voice recording");
    await updateVoiceRecordingAsFailed(id, errorMsg).catch((err: unknown) => {
      logger.error({ id, err }, "Failed to write failure state to DB");
    });
  }
}
