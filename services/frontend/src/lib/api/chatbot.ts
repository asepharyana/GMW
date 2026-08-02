import type { ChatbotHistoryRow, ChatbotResponse } from "@/lib/types";
import { api } from "./client";

export const chatbotApi = {
  send: (message: string, guildId?: string) =>
    api.post<ChatbotResponse>("/api/chat", {
      message,
      context: guildId ? { guildId } : undefined,
    }),

  getHistory: () =>
    api.get<{ history: ChatbotHistoryRow[]; total: number }>(
      "/api/chat/history",
    ),

  clearHistory: () => api.delete<{ ok: boolean }>("/api/chat/history"),
};
