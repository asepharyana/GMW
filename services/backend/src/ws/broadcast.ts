/**
 * Broadcast functions for WebSocket events.
 *
 * These are injected by ws/server.ts when the WebSocket server initializes.
 * Other modules call them to push real-time events to connected frontend clients.
 *
 * Usage:
 *   import { broadcastEvent } from "../ws/broadcast.js";
 *   broadcastEvent("message_created", messageData);
 */

import { createChildLogger } from "@bete/shared/logger";

const logger = createChildLogger("broadcast");

type BroadcastFn = (type: string, data: unknown) => void;
type BroadcastBinaryFn = (data: Buffer) => void;

let _broadcast: BroadcastFn | null = null;
let _broadcastBinary: BroadcastBinaryFn | null = null;

let _enabled = true;

/** Enable or disable broadcast logging (disabled by default to reduce noise). */
export function setBroadcastLogging(enabled: boolean): void {
  _enabled = enabled;
}

/**
 * Inject broadcast functions from the WebSocket server initializer.
 * Must be called once during server startup before any broadcast is used.
 */
export function setBroadcastFunctions(
  bf: BroadcastFn,
  bfBinary: BroadcastBinaryFn,
): void {
  _broadcast = bf;
  _broadcastBinary = bfBinary;
  logger.info("Broadcast functions initialized");
}

/** Clear injected functions (used during cleanup). */
export function clearBroadcastFunctions(): void {
  _broadcast = null;
  _broadcastBinary = null;
  logger.info("Broadcast functions cleared");
}

function shouldLog(type: string): boolean {
  if (!_enabled) return false;
  // Avoid logging high-volume events
  if (type === "voice_pcm_data") return false;
  return true;
}

/**
 * Broadcast a JSON event to all connected WebSocket clients.
 */
export function broadcastEvent(type: string, data: unknown): void {
  if (shouldLog(type)) {
    logger.debug({ event: type }, "Broadcasting event");
  }
  _broadcast?.(type, data);
}

/**
 * Broadcast binary data to all connected WebSocket clients.
 */
export function broadcastBinary(data: Buffer): void {
  _broadcastBinary?.(data);
}
