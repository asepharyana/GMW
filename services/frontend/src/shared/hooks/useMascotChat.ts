import { useCallback, useState } from "react";

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
        const response = await fetch("/api/mascot/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, context }),
        });

        if (!response.ok) {
          throw new Error(`Mascot backend responded with ${response.status}`);
        }

        const data = (await response.json()) as { response?: string };
        return data.response || fallbackResponse(message, context);
      } catch (error) {
        console.warn("Mascot backend unavailable, using fallback", error);
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

  if (lower.includes("berapa") && (lower.includes("orang") || lower.includes("user"))) {
    return `Ada ${context?.activeParticipants || 0} user aktif yang terdeteksi 👥`;
  }

  return `Aku belum bisa menghubungi backend, tapi dari konteks lokal ada ${context?.messageCount || 0} pesan dan ${context?.activeParticipants || 0} user aktif. Coba tanya "ringkasan obrolan" atau "berapa pesan" ya.`;
}
