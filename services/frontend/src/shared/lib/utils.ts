import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
}

export function formatDate(value: number): string {
  return new Date(value).toLocaleString();
}

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
  reference?: {
    messageId: string | null;
    channelId: string | null;
    guildId: string | null;
    type: string | null;
    content: string | null;
    repliedUsername: string | null;
    repliedUserId: string | null;
  } | null;
  isCrosspost?: boolean;
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
