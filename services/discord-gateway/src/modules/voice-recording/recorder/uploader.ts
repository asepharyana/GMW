import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { createChildLogger } from "@/shared/logger/index";
import { config } from "../../../shared/config/config.js";
import {
  insertVoiceRecording,
  updateVoiceRecordingAsFailed,
  updateVoiceRecordingAsUploaded,
  updateVoiceRecordingTranscription,
} from "../../../shared/database/voiceRecordingRepo.js";
import { uploadToTele } from "../../../shared/uploader.js";
import { transcribeRecording } from "../voiceTranscriber.js";

const logger = createChildLogger("recording-uploader");
const execFileAsync = promisify(execFile);

/**
 * Transcode an Opus/OGG segment to MP3 so recordings are playable on any
 * device (Safari/iPhone cannot play OGG). Uses PATH-resolved ffmpeg from the
 * Nix closure. Returns the path to the temporary MP3 file.
 */
async function transcodeToMp3(oggPath: string): Promise<string> {
  const mp3Path = oggPath.replace(/\.ogg$/i, ".mp3");
  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-i",
      oggPath,
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "128k",
      "-ar",
      "48000",
      "-ac",
      "2",
      mp3Path,
    ],
    { timeout: 30_000 },
  );
  return mp3Path;
}

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

    // 1b. Transcode segment to MP3 (universal playback; Safari can't play OGG)
    const mp3Path = await transcodeToMp3(oggPath);
    const mp3Name = path.basename(mp3Path);
    const mp3Stats = await fs.promises.stat(mp3Path);

    // 2. Perform async upload with retry logic
    const fileBuffer = await fs.promises.readFile(mp3Path);
    const uploadResult = await uploadToTele({
      buffer: fileBuffer,
      filename: mp3Name,
      contentType: "audio/mpeg",
      uploadUrl: config.TELE_UPLOAD_URL,
      retries: 3,
    });
    const downloadUrl = uploadResult.url;

    // 2b. Clean up the temporary MP3 (source OGG is kept for transcription)
    await fs.promises.unlink(mp3Path).catch(() => {});

    // 3. Update DB to uploaded state (filename/size reflect the MP3 artifact)
    await updateVoiceRecordingAsUploaded(
      id,
      downloadUrl,
      Date.now(),
      mp3Name,
      mp3Stats.size,
    );
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
          filename: mp3Name,
          size_bytes: mp3Stats.size,
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

    // 5. Fire-and-forget voice transcription
    if (config.AI_VOICE_TRANSCRIPTION_ENABLED) {
      transcribeRecording(oggPath).then((transcription) => {
        if (transcription) {
          updateVoiceRecordingTranscription(id, transcription).catch(
            (err: unknown) => {
              logger.warn({ id, err }, "Failed to persist transcription");
            },
          );
        }
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
