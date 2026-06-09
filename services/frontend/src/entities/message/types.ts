export type {
  AIRecommendedAction,
  AISeverity,
  AIStatus,
  MessageRecord,
  PageResult,
} from "@bete/shared";

export interface MessageMetadata {
  stickers?: Array<{ name?: string; url?: string }>;
  attachments?: Array<{ name: string; url: string; contentType?: string }>;
  embeds?: Array<{ title?: string; image?: string; thumbnail?: string }>;
  channel?: {
    channelId: string;
    channelName?: string;
    threadId?: string;
    threadName?: string;
  };
}

export function parseMetadata(value: string | null): MessageMetadata {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as MessageMetadata;
    return parsed;
  } catch {
    return {};
  }
}
