/**
 * Broadcast functions for WebSocket events.
 *
 * These are injected by ws/server.ts when the WebSocket server initializes.
 * Other modules call them to push real-time events to connected frontend clients.
 *
 * Usage:
 *   import { broadcastMessageCreated } from "../ws/broadcast.js";
 *   broadcastMessageCreated(messageData);
 */

import { createChildLogger } from "@bete/shared/logger";

const logger = createChildLogger("broadcast");

type BroadcastFn = (data: unknown) => void;
type BroadcastRawFn = (type: string, data: unknown) => void;
type BroadcastBinaryFn = (data: Buffer) => void;

export interface BroadcastFunctions {
  messageCreated: BroadcastFn;
  messageUpdated: BroadcastFn;
  messageDeleted: BroadcastFn;
  messageAnalyzed: BroadcastFn;
  attachmentCreated: BroadcastFn;
  attachmentUploaded: BroadcastFn;
  voiceRecordingStarted: BroadcastFn;
  voiceRecordingStopped: BroadcastFn;
  voiceRecordingUploaded: BroadcastFn;
  voicePcmData: BroadcastFn;
  voiceActiveUser: BroadcastFn;
  analysisQueueStatus: BroadcastFn;
  raw: BroadcastRawFn;
  binary: BroadcastBinaryFn;
}

let _fns: BroadcastFunctions | null = null;

let _enabled = true;

/** Enable or disable broadcast logging (disabled by default to reduce noise). */
export function setBroadcastLogging(enabled: boolean): void {
  _enabled = enabled;
}

/**
 * Inject broadcast functions from the WebSocket server initializer.
 * Must be called once during server startup before any broadcast is used.
 */
export function setBroadcastFunctions(fns: BroadcastFunctions): void {
  _fns = fns;
  logger.info("Broadcast functions initialized");
}

/** Clear injected functions (used during cleanup). */
export function clearBroadcastFunctions(): void {
  _fns = null;
  logger.info("Broadcast functions cleared");
}

function logBroadcast(name: string, data: unknown): void {
  if (!_enabled) return;
  // Avoid logging binary or PCM data due to volume
  if (name === "voice_pcm_data" || name === "binary") return;
  logger.debug({ event: name }, "Broadcasting event");
}

export const broadcastMessageCreated: BroadcastFn = (data) => {
  logBroadcast("message_created", data);
  _fns?.messageCreated?.(data);
};

export const broadcastMessageUpdated: BroadcastFn = (data) => {
  logBroadcast("message_updated", data);
  _fns?.messageUpdated?.(data);
};

export const broadcastMessageDeleted: BroadcastFn = (data) => {
  logBroadcast("message_deleted", data);
  _fns?.messageDeleted?.(data);
};

export const broadcastAttachmentCreated: BroadcastFn = (data) => {
  logBroadcast("attachment_created", data);
  _fns?.attachmentCreated?.(data);
};

export const broadcastAttachmentUploaded: BroadcastFn = (data) => {
  logBroadcast("attachment_uploaded", data);
  _fns?.attachmentUploaded?.(data);
};

export const broadcastMessageAnalyzed: BroadcastFn = (data) => {
  logBroadcast("message_analyzed", data);
  _fns?.messageAnalyzed?.(data);
};

export const broadcastVoiceRecordingStarted: BroadcastFn = (data) => {
  logBroadcast("voice_recording_started", data);
  _fns?.voiceRecordingStarted?.(data);
};

export const broadcastVoiceRecordingStopped: BroadcastFn = (data) => {
  logBroadcast("voice_recording_stopped", data);
  _fns?.voiceRecordingStopped?.(data);
};

export const broadcastVoiceRecordingUploaded: BroadcastFn = (data) => {
  logBroadcast("voice_recording_uploaded", data);
  _fns?.voiceRecordingUploaded?.(data);
};

export const broadcastVoicePcmData: BroadcastFn = (data) => {
  // PCM data is high-volume; logging is skipped unconditionally
  _fns?.voicePcmData?.(data);
};

export const broadcastVoiceActiveUser: BroadcastFn = (data) => {
  logBroadcast("voice_active_user", data);
  _fns?.voiceActiveUser?.(data);
};

export const broadcastAnalysisQueueStatus: BroadcastFn = (data) => {
  logBroadcast("analysis_queue_status", data);
  _fns?.analysisQueueStatus?.(data);
};

export const broadcastRaw: BroadcastRawFn = (type, data) => {
  logBroadcast(type, data);
  _fns?.raw?.(type, data);
};

export const broadcastBinary: BroadcastBinaryFn = (data) => {
  // Binary data is high-volume; logging is skipped unconditionally
  _fns?.binary?.(data);
};
