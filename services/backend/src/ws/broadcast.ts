/**
 * Global broadcast functions for WebSocket events.
 *
 * These are assigned by ws/server.ts when the WebSocket server initializes.
 * Other modules call them to push real-time events to connected frontend clients.
 *
 * Usage:
 *   import { broadcastMessageCreated } from "../ws/broadcast.js";
 *   broadcastMessageCreated(messageData);
 */

type BroadcastFn = (data: unknown) => void;
type BroadcastRawFn = (type: string, data: unknown) => void;
type BroadcastBinaryFn = (data: Buffer) => void;

declare global {
  // biome-ignore lint/suspicious/noAssignInExpressions: intentional global broadcast registry
  var __broadcastFns:
    | {
        messageCreated: BroadcastFn;
        messageUpdated: BroadcastFn;
        messageDeleted: BroadcastFn;
        attachmentUploaded: BroadcastFn;
        raw: BroadcastRawFn;
        binary: BroadcastBinaryFn;
      }
    | undefined;
}

const noop: BroadcastFn = () => {};
const noopRaw: BroadcastRawFn = () => {};
const noopBinary: BroadcastBinaryFn = () => {};

export const broadcastMessageCreated: BroadcastFn = (data) =>
  (globalThis.__broadcastFns?.messageCreated ?? noop)(data);

export const broadcastMessageUpdated: BroadcastFn = (data) =>
  (globalThis.__broadcastFns?.messageUpdated ?? noop)(data);

export const broadcastMessageDeleted: BroadcastFn = (data) =>
  (globalThis.__broadcastFns?.messageDeleted ?? noop)(data);

export const broadcastAttachmentUploaded: BroadcastFn = (data) =>
  (globalThis.__broadcastFns?.attachmentUploaded ?? noop)(data);

export const broadcastRaw: BroadcastRawFn = (type, data) =>
  (globalThis.__broadcastFns?.raw ?? noopRaw)(type, data);

export const broadcastBinary: BroadcastBinaryFn = (data) =>
  (globalThis.__broadcastFns?.binary ?? noopBinary)(data);
