import { useCallback, useState } from "react";
import type { ChatResponse } from "../../entities/dashboard/types.js";
import { request } from "../api/client";
import { createLogger } from "../lib/logger";

const logger = createLogger("useMascotChat");

export interface ChatContext {
  messageCount: number;
  activeParticipants: number;
  lastActivity: string;
  topicsDiscussed: string[];
  guildId?: string;
  channelId?: string;
}

export function useMascotChat(context?: ChatContext) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSendMessage = useCallback(
    async (message: string): Promise<string> => {
      try {
        const data = await request<ChatResponse>("/api/chat", {
          method: "POST",
          body: JSON.stringify({ message, context }),
        });
        return data.response || fallbackResponse(message, context);
      } catch (error) {
        logger.warn("Mascot backend unavailable, using fallback", { error });
        return fallbackResponse(message, context);
      }
    },
    [context],
  );

  return {
    isOpen,
    setIsOpen,
    handleSendMessage,
  };
}

function fallbackResponse(input: string, context?: ChatContext): string {
  const lower = input.toLowerCase();

  if (lower.includes("ringkasan") || lower.includes("summary")) {
    return `Aku rangkum cepat ya ✨ Ada ${context?.messageCount || 0} pesan dari ${context?.activeParticipants || 0} user aktif. Backend belum bisa dihubungi, jadi ini ringkasan lokal sementara.`;
  }

  if (lower.includes("berapa") && lower.includes("pesan")) {
    return `Ada ${context?.messageCount || 0} pesan di konteks dashboard saat ini 📊`;
  }

  if (
    lower.includes("berapa") &&
    (lower.includes("orang") || lower.includes("user"))
  ) {
    return `Ada ${context?.activeParticipants || 0} user aktif yang terdeteksi 👥`;
  }

  return `Aku belum bisa menghubungi backend, tapi dari konteks lokal ada ${context?.messageCount || 0} pesan dan ${context?.activeParticipants || 0} user aktif. Coba tanya "ringkasan obrolan" atau "berapa pesan" ya.`;
}
