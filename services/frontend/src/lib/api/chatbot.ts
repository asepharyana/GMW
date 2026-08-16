import { orpc } from "@/lib/orpc/client";
import type { ChatbotHistoryRow, ChatbotResponse } from "@/lib/types";

export const chatbotApi = {
  send: (message: string, guildId?: string, userId?: string) =>
    orpc.chatbot.chat({
      message,
      context: guildId ? { guildId } : undefined,
      userId,
    }) as unknown as Promise<ChatbotResponse>,

  getHistory: (userId?: string) =>
    orpc.chatbot.history({ limit: 50, userId }) as unknown as Promise<{
      history: ChatbotHistoryRow[];
      total: number;
    }>,

  clearHistory: (userId?: string) =>
    orpc.chatbot.clearHistory({ userId }) as unknown as Promise<{
      ok: boolean;
    }>,
};
