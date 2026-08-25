/**
 * FNV-1a 32-bit hash — same hash the gateway uses to tag PCM frames.
 * Shared between use-voice hooks and ambient-canvas.
 */
export function hashUserId(userId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
