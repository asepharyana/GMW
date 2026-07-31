/**
 * Format a number with locale separators.
 */
export function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * Format bytes into a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Safely parse a JSON string into an array.
 */
export function safeParseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

/**
 * Safely parse a JSON string into an object.
 */
export function safeParseJsonObject(
  value: string | null | undefined,
): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === "object" && parsed !== null) return parsed;
    return {};
  } catch {
    return {};
  }
}

/**
 * Resolve a human-readable channel/thread label for a message.
 *
 * The channel name (and thread name, when the message lives in a thread)
 * is captured by the gateway into the message metadata JSON under
 * `metadata.channel.{channelName,threadName}`. Prefer names over raw IDs:
 * a thread message shows its thread name, otherwise the channel name,
 * falling back to a truncated channel ID only when names are unavailable.
 */
export function getMessageChannelLabel(msg: {
  channel_id?: string;
  metadata?: string | null;
}): string {
  let channelName: string | undefined;
  let threadName: string | undefined;
  try {
    const m = JSON.parse(msg.metadata ?? "");
    const ch = m?.channel;
    channelName =
      typeof ch?.channelName === "string" ? ch.channelName : undefined;
    threadName = typeof ch?.threadName === "string" ? ch.threadName : undefined;
  } catch {
    // metadata malformed — fall through to ID fallback
  }
  if (threadName) return threadName;
  if (channelName) return channelName;
  return msg.channel_id?.slice(0, 8) ?? "";
}
