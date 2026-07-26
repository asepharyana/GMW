import type { ChatHistoryMessage, MascotChatResponse } from "@/lib/types";
import { api } from "./client";

export const mascotApi = {
  send: (message: string) =>
    api.post<MascotChatResponse>("/api/mascot/chat", { message }),

  getHistory: () => api.get<ChatHistoryMessage[]>("/api/mascot/chat/history"),

  clearHistory: () => api.delete<{ ok: boolean }>("/api/mascot/chat/history"),
};
