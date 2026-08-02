import { createChildLogger } from "@/shared/logger/index";
import { config } from "../../shared/config/index.js";
import type {
  ChatbotContext,
  ChatbotHistoryRow,
  SaveConversationInput,
} from "./chatbot.repository.js";
import { chatbotRepository } from "./chatbot.repository.js";
import { executeTool, tools } from "./chatbot.tools.js";

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

      // Gateway tidak handle role system — gabung konteks ke user message.
      // The system section stays visible to the model as the first user turn.
      const contextPrefixed = `${systemPrompt}\n\nPertanyaan user: ${userMessage}`;

      // Seed conversation: prior turns + current question.
      const messages: Array<
        | { role: "user" | "assistant"; content: string }
        | {
            role: "assistant";
            content: string | null;
            tool_calls: Array<{
              id: string;
              type: "function";
              function: { name: string; arguments: string };
            }>;
          }
        | { role: "tool"; tool_call_id: string; content: string }
      > = [...history, { role: "user", content: contextPrefixed }];

      // ── Agentic tool loop ─────────────────────────────────────────
      const MAX_TOOL_ROUNDS = 4;
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
        const response = await axios.post(
          `${baseUrl}/chat/completions`,
          {
            model,
            messages,
            tools,
            tool_choice: "auto",
            max_tokens: 600,
            temperature: 0.4,
            stream: true,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            timeout: 45_000,
            // 9router returns SSE even without stream:true; force stream:true
            // in the body and read the raw SSE text.
            responseType: "text",
          },
        );

        // Parse SSE `data:` lines → content + tool_calls.
        const { content, toolCalls } = this.parseSse(response.data as string);

        logger.debug(
          {
            round,
            hasToolCalls: toolCalls.length > 0,
            toolNames: toolCalls.map((t) => t.name),
          },
          "LLM round parsed",
        );

        if (toolCalls.length > 0) {
          // Execute each tool, append tool results, continue loop.
          for (const tc of toolCalls) {
            messages.push({
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: tc.id,
                  type: "function",
                  function: { name: tc.name, arguments: tc.arguments },
                },
              ],
            });
            let result = "";
            try {
              result = await executeTool(tc.name, tc.args);
            } catch (e) {
              result = `Tool error: ${(e as Error).message}`;
            }
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: result,
            });
          }
          if (round === MAX_TOOL_ROUNDS) {
            logger.warn("Hit max tool rounds; returning what we have");
          }
          continue;
        }

        if (content?.trim()) {
          return content.trim();
        }

        logger.warn("LLM returned empty response (no tools, no content)");
        return this.fallbackResponse(userMessage);
      }

      logger.warn("Tool loop exhausted without final content");
      return this.fallbackResponse(userMessage);
    } catch (error) {
      logger.warn({ error }, "LLM call failed, using fallback response");
      return this.fallbackResponse(userMessage);
    }
  }

  /**
   * Parse an SSE stream body into accumulated content + any tool_calls.
   * 9router (and most OpenAI-compatible routers) emit `data: {json}` lines
   * even when stream is only implied; we must collect deltas manually.
   */
  private parseSse(body: string): {
    content: string;
    toolCalls: Array<{
      id: string;
      name: string;
      arguments: string;
      args: Record<string, unknown>;
    }>;
  } {
    const contentParts: string[] = [];
    const toolById = new Map<
      string,
      { id: string; name: string; arguments: string }
    >();

    const lines = body.split("\n");
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{
            delta?: {
              content?: string;
              tool_calls?: Array<{
                id?: string;
                index?: number;
                type?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
            finish_reason?: string | null;
          }>;
        };
        const delta = json.choices?.[0]?.delta;
        if (!delta) continue;
        if (delta.content) contentParts.push(delta.content);
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = String(tc.index ?? 0);
            const cur = toolById.get(idx) ?? {
              id: tc.id ?? "",
              name: "",
              arguments: "",
            };
            // Keep the first non-empty id for this call index.
            if (tc.id && !cur.id) cur.id = tc.id;
            if (tc.function?.name) cur.name += tc.function.name;
            if (tc.function?.arguments) cur.arguments += tc.function.arguments;
            toolById.set(idx, cur);
          }
        }
      } catch {
        // Skip malformed lines (keepalives, etc.)
      }
    }

    // Build a de-duplicated id for any call the stream never assigned one.
    let fallbackId = 0;
    const toolCalls = Array.from(toolById.values()).map((tc) => {
      const id = tc.id || `tool_${fallbackId++}_${Date.now()}`;
      return {
        id,
        name: tc.name,
        arguments: tc.arguments,
        args: this.safeJsonParse(tc.arguments),
      };
    });

    return { content: contentParts.join(""), toolCalls };
  }

  private safeJsonParse(s: string): Record<string, unknown> {
    try {
      return JSON.parse(s) as Record<string, unknown>;
    } catch {
      return {};
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
