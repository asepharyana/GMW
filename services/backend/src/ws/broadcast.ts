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

const noop: BroadcastFn = () => {};
const noopRaw: BroadcastRawFn = () => {};
const noopBinary: BroadcastBinaryFn = () => {};

let _fns: BroadcastFunctions | null = null;

/**
 * Inject broadcast functions from the WebSocket server initializer.
 * Must be called once during server startup before any broadcast is used.
 */
export function setBroadcastFunctions(fns: BroadcastFunctions): void {
  _fns = fns;
}

/** Clear injected functions (used during cleanup). */
export function clearBroadcastFunctions(): void {
  _fns = null;
}

export const broadcastMessageCreated: BroadcastFn = (data) =>
  (_fns?.messageCreated ?? noop)(data);

export const broadcastMessageUpdated: BroadcastFn = (data) =>
  (_fns?.messageUpdated ?? noop)(data);

export const broadcastMessageDeleted: BroadcastFn = (data) =>
  (_fns?.messageDeleted ?? noop)(data);

export const broadcastAttachmentCreated: BroadcastFn = (data) =>
  (_fns?.attachmentCreated ?? noop)(data);

export const broadcastAttachmentUploaded: BroadcastFn = (data) =>
  (_fns?.attachmentUploaded ?? noop)(data);

export const broadcastMessageAnalyzed: BroadcastFn = (data) =>
  (_fns?.messageAnalyzed ?? noop)(data);

export const broadcastVoiceRecordingStarted: BroadcastFn = (data) =>
  (_fns?.voiceRecordingStarted ?? noop)(data);

export const broadcastVoiceRecordingStopped: BroadcastFn = (data) =>
  (_fns?.voiceRecordingStopped ?? noop)(data);

export const broadcastVoiceRecordingUploaded: BroadcastFn = (data) =>
  (_fns?.voiceRecordingUploaded ?? noop)(data);

export const broadcastVoicePcmData: BroadcastFn = (data) =>
  (_fns?.voicePcmData ?? noop)(data);

export const broadcastVoiceActiveUser: BroadcastFn = (data) =>
  (_fns?.voiceActiveUser ?? noop)(data);

export const broadcastAnalysisQueueStatus: BroadcastFn = (data) =>
  (_fns?.analysisQueueStatus ?? noop)(data);

export const broadcastRaw: BroadcastRawFn = (type, data) =>
  (_fns?.raw ?? noopRaw)(type, data);

export const broadcastBinary: BroadcastBinaryFn = (data) =>
  (_fns?.binary ?? noopBinary)(data);
