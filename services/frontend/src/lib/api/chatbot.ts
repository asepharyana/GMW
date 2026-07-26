import type { ChatbotResponse, ChatHistoryMessage } from "@/lib/types";
import { api } from "./client";

export const chatbotApi = {
  send: (message: string) =>
    api.post<ChatbotResponse>("/api/mascot/chat", { message }),

  getHistory: () => api.get<ChatHistoryMessage[]>("/api/mascot/chat/history"),

  clearHistory: () => api.delete<{ ok: boolean }>("/api/mascot/chat/history"),
};
