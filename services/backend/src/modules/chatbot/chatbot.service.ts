import { createChildLogger } from "@bete/shared/logger";
import { config } from "../../shared/config/index.js";
import type {
  ChatbotContext,
  ChatbotHistoryRow,
  SaveConversationInput,
} from "./chatbot.repository.js";
import { chatbotRepository } from "./chatbot.repository.js";

const logger = createChildLogger("chatbot.service");

class ChatbotService {
  async processMessage(
    message: string,
    context: ChatbotContext | undefined,
    userId: string,
  ): Promise<string> {
    logger.info(
      { userId, messageLength: message.length },
      "processMessage called",
    );
    const recentContext = await this.getRecentConversationContext(userId);
    const serverInsights = await chatbotRepository.getServerInsights(
      context?.guildId,
      context?.channelId,
    );

    // Build LLM messages
    const systemPrompt = this.buildSystemPrompt(serverInsights);
    const conversationHistory = this.buildHistoryMessages(recentContext);
    const llmResponse = await this.callLLM(
      systemPrompt,
      conversationHistory,
      message,
    );

    return llmResponse;
  }

  async saveConversation(input: SaveConversationInput): Promise<void> {
    logger.info({ userId: input.userId }, "saveConversation called");
    await chatbotRepository.saveConversation(input);
  }

  async getChatHistory(
    userId: string,
    limit: number,
  ): Promise<ChatbotHistoryRow[]> {
    logger.debug({ userId, limit }, "getChatHistory called");
    return chatbotRepository.getChatHistory(userId, limit);
  }

  async clearChatHistory(userId: string): Promise<void> {
    logger.info({ userId }, "clearChatHistory called");
    await chatbotRepository.clearChatHistory(userId);
  }

  private async getRecentConversationContext(
    userId: string,
  ): Promise<string[]> {
    const history = await chatbotRepository.getChatHistory(userId, 3);
    return history.flatMap((row) => [
      `User: ${row.user_message}`,
      `Bot: ${row.bot_response}`,
    ]);
  }

  private buildSystemPrompt(insights: {
    total_messages: number;
    active_users: number;
    flagged: number;
    warned: number;
  }): string {
    return `Kamu lagi ngobrol sama chatbot Discord Watcher — temen ngobrol yang tau keadaan server.

Data server saat ini:
- Pesan: ${insights.total_messages}
- User aktif: ${insights.active_users}
- Flagged: ${insights.flagged}
- Warning: ${insights.warned}

Gaya ngobrol:
- Santai, hangat, kayak ngobrol sama temen
- Pake Bahasa Indonesia sehari-hari, ga perlu kaku
- Sesekali pake emoji wajar aja, ga berlebihan
- Kalo ditanya sesuatu yang kamu tau dari data server, jawab pake data itu
- Kalo ga tau atau ga nyambung, bilang aja terus tanya balik biar ngobrolnya jalan
- Jangan sebut "rule", "instruksi", "prompt" atau apapun soal cara kamu berpikir
- Biasa aja, ga usaha lucu-lucu amat — natural`;
  }

  private buildHistoryMessages(
    recentContext: string[],
  ): Array<{ role: "user" | "assistant"; content: string }> {
    // recentContext is alternating User/Bot messages
    return recentContext.map((text) => {
      if (text.startsWith("User: ")) {
        return { role: "user" as const, content: text.slice(6) };
      }
      return { role: "assistant" as const, content: text.slice(7) };
    });
  }

  private async callLLM(
    systemPrompt: string,
    history: Array<{ role: "user" | "assistant"; content: string }>,
    userMessage: string,
  ): Promise<string> {
    const apiKey = config.AI_LLM_API_KEY;
    const baseUrl = config.AI_LLM_BASE_URL;
    const model = config.AI_LLM_MODEL;

    if (!apiKey) {
      logger.warn("AI_LLM_API_KEY not configured, using fallback response");
      return this.fallbackResponse(userMessage);
    }

    try {
      const { default: axios } = await import("axios");

      // Gateway tidak handle role system — gabung konteks ke user message
      const contextPrefixed = `${systemPrompt}\n\nPertanyaan user: ${userMessage}`;

      const messages: Array<{ role: "user" | "assistant"; content: string }> = [
        ...history,
        { role: "user", content: contextPrefixed },
      ];

      const response = await axios.post(
        `${baseUrl}/chat/completions`,
        {
          model,
          messages,
          max_tokens: 500,
          temperature: 0.4,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 30_000,
        },
      );

      const result = response.data as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = result?.choices?.[0]?.message?.content?.trim();

      if (content) {
        return content;
      }

      logger.warn({ response: result }, "LLM returned empty response");
      return this.fallbackResponse(userMessage);
    } catch (error) {
      logger.warn({ error }, "LLM call failed, using fallback response");
      return this.fallbackResponse(userMessage);
    }
  }

  private fallbackResponse(input: string): string {
    const lower = input.toLowerCase();

    if (
      lower.includes("halo") ||
      lower.includes("hai") ||
      lower.includes("hi") ||
      lower.includes("pagi") ||
      lower.includes("siang") ||
      lower.includes("malam")
    ) {
      return "Halo! 👋 Lagi offline bentar, coba chat lagi nanti ya.";
    }

    return "Maaf, lagi ada masalah koneksi. Coba tanya lagi nanti!";
  }
}

export const chatbotService = new ChatbotService();
