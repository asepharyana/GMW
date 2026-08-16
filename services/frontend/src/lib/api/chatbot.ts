import { trpc } from "@/lib/trpc/client";
import type { ChatbotHistoryRow, ChatbotResponse } from "@/lib/types";

export const chatbotApi = {
  send: (message: string, guildId?: string, userId?: string) =>
    trpc.chatbot.chat.mutate({
      message,
      context: guildId ? { guildId } : undefined,
      userId,
    }) as unknown as Promise<ChatbotResponse>,

  getHistory: (userId?: string) =>
    trpc.chatbot.history.query({
      limit: 50,
      userId,
    }) as unknown as Promise<{ history: ChatbotHistoryRow[]; total: number }>,

  clearHistory: (userId?: string) =>
    trpc.chatbot.clearHistory.mutate({
      userId,
    }) as unknown as Promise<{ ok: boolean }>,
};
