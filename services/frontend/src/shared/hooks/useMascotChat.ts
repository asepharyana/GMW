import { useCallback, useState } from "react";

/**
 * useMascotChat — Hook untuk handle mascot chatbot responses
 * Dapat di-extend dengan Discord Gateway atau API backend
 */

interface ChatContext {
  messageCount: number;
  activeParticipants: number;
  lastActivity: string;
  topicsDiscussed: string[];
}

export function useMascotChat(context?: ChatContext) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSendMessage = useCallback(
    async (message: string): Promise<string> => {
      // Simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      // For now, generate response based on keywords
      // Later dapat di-replace dengan actual AI backend atau Discord integration
      return generateIntelligentResponse(message, context);
    },
    [context]
  );

  return {
    isOpen,
    setIsOpen,
    handleSendMessage,
  };
}

/**
 * Intelligent response generator
 * Can be extended to call backend API, Discord Gateway, atau AI service
 */
function generateIntelligentResponse(
  input: string,
  context?: ChatContext
): string {
  const lower = input.toLowerCase();

  // Analytics-related questions
  if (
    lower.includes("berapa") ||
    lower.includes("jumlah") ||
    lower.includes("total")
  ) {
    if (lower.includes("pesan")) {
      return `📊 Ada ${context?.messageCount || 0} pesan dalam conversation. Cukup aktif ya! Mau tahu siapa yang paling banyak chat?`;
    }
    if (lower.includes("orang") || lower.includes("partisipan")) {
      return `👥 Ada ${context?.activeParticipants || 0} orang yang aktif chat. Mereka bekerja sama dengan baik!`;
    }
  }

  // Insights-related questions
  if (
    lower.includes("insight") ||
    lower.includes("ringkasan") ||
    lower.includes("summary")
  ) {
    return `📈 Dari yang aku lihat:
• Activity Level: ${context?.lastActivity || "Tinggi"}
• Top Topics: ${context?.topicsDiscussed?.join(", ") || "General discussion"}
• Engagement: Very Good! 🎯`;
  }

  // Recommendations
  if (lower.includes("saran") || lower.includes("rekomendasi")) {
    return `💡 Rekomendasi aku:
1. Tingkatkan engagement dengan more interactive discussions
2. Dokumentasikan insights untuk future reference
3. Libatkan semua partisipan dalam decision making
4. Monitor trends untuk continuous improvement

Bagus banget perkembangannya! 🚀`;
  }

  // Help/Info
  if (
    lower.includes("bantuan") ||
    lower.includes("apa aja") ||
    lower.includes("bisa")
  ) {
    return `🤖 Aku bisa membantu dengan:
• Analytics & Insights
• Conversation Summaries
• Participant Analysis
• Trend Detection
• Recommendations
• General Q&A

Tanya aja yang pengen kamu tahu! 😊`;
  }

  // Greeting
  if (
    lower.includes("halo") ||
    lower.includes("hi") ||
    lower.includes("hey") ||
    lower.includes("pagi")
  ) {
    return `Halo! 👋 Apa kabar? Ada yang bisa aku bantu tentang conversation ini?`;
  }

  // Default intelligent response
  return `Interessant! "${input}" - itu observation yang valid. Dari analytics, ini berhubungan dengan conversation patterns yang kami track. Ada follow-up question? 🎯`;
}

/**
 * Backend integration hook
 * Uncomment dan modify untuk integrate dengan actual backend/Discord Gateway
 */

/*
export async function callMascotAIBackend(message: string, context?: ChatContext): Promise<string> {
  try {
    const response = await fetch('/api/mascot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, context }),
    });

    if (!response.ok) throw new Error('Backend error');
    const data = await response.json();
    return data.response;
  } catch (error) {
    console.error('Error calling mascot backend:', error);
    return generateIntelligentResponse(message, context);
  }
}

export async function callDiscordGateway(message: string, guildId: string): Promise<string> {
  // Call Discord Gateway untuk mendapat context lebih kaya
  // Implementasi akan bergantung pada Discord API integration
  try {
    const response = await fetch('/api/discord/guild-context', {
      method: 'POST',
      body: JSON.stringify({ guildId, query: message }),
    });
    const context = await response.json();
    return generateIntelligentResponse(message, context);
  } catch (error) {
    console.error('Error calling Discord Gateway:', error);
    return generateIntelligentResponse(message);
  }
}
*/
