import type { ChatbotHistoryRow, ChatbotResponse } from "@/lib/types";
import { api } from "./client";

function userHeader(userId?: string): Record<string, string> {
  return userId && userId !== "anonymous" ? { "X-User-Id": userId } : {};
}

export const chatbotApi = {
  send: (message: string, guildId?: string, userId?: string) =>
    api.post<ChatbotResponse>(
      "/api/chat",
      {
        message,
        context: guildId ? { guildId } : undefined,
      },
      userHeader(userId),
    ),

  getHistory: (userId?: string) =>
    api.get<{ history: ChatbotHistoryRow[]; total: number }>(
      "/api/chat/history",
      userHeader(userId),
    ),

  clearHistory: (userId?: string) =>
    api.delete<{ ok: boolean }>("/api/chat/history", userHeader(userId)),
};
