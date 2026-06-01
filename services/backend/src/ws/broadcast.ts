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

// Extend globalThis with broadcast function types
declare global {
  // biome-ignore lint/suspicious/noAssignInExpressions: intentional global broadcast registry
  var broadcastMessageCreated: BroadcastFn | undefined;
  var broadcastMessageUpdated: BroadcastFn | undefined;
  var broadcastMessageDeleted: BroadcastFn | undefined;
  var broadcastAttachmentUploaded: BroadcastFn | undefined;
}

const noop: BroadcastFn = () => {};

export const broadcastMessageCreated: BroadcastFn = (...args) =>
  (globalThis.broadcastMessageCreated ?? noop)(...args);

export const broadcastMessageUpdated: BroadcastFn = (...args) =>
  (globalThis.broadcastMessageUpdated ?? noop)(...args);

export const broadcastMessageDeleted: BroadcastFn = (...args) =>
  (globalThis.broadcastMessageDeleted ?? noop)(...args);

export const broadcastAttachmentUploaded: BroadcastFn = (...args) =>
  (globalThis.broadcastAttachmentUploaded ?? noop)(...args);
