import { createChildLogger } from "@/shared/logger/index";
import { config } from "../../shared/config/index.js";
import type {
  ChatbotContext,
  ChatbotHistoryRow,
  SaveConversationInput,
} from "./chatbot.repository.js";
import { chatbotRepository } from "./chatbot.repository.js";
import { tools } from "./chatbot.toolDefs.js";
import { executeTool } from "./chatbot.tools.js";

const logger = createChildLogger("chatbot.service");

class ChatbotService {
  async processMessage(
    message: string,
    context: ChatbotContext | undefined,
    userId: string,
  ): Promise<string> {
    logger.info(
      { userId, messageLength: message.length, context },
      "processMessage called",
    );
    const recentContext = await this.getRecentConversationContext(userId);
    // Scope the agent to the server/channel the user is chatting in. We no
    // longer bake server stats into the prompt — the model must pull current
    // data via tools (see buildSystemPrompt), so it always answers from live
    // numbers instead of a stale snapshot.
    const scope = {
      guildId: context?.guildId,
      channelId: context?.channelId,
    };

    const systemPrompt = this.buildSystemPrompt(scope);
    const conversationHistory = this.buildHistoryMessages(recentContext);
    const llmResponse = await this.callLLM(
      systemPrompt,
      conversationHistory,
      message,
      scope,
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

  private buildSystemPrompt(scope: {
    guildId?: string;
    channelId?: string;
  }): string {
    const scopeLine = scope.guildId
      ? `- Scope: kamu menjawab soal server/guild id="${scope.guildId}"${scope.channelId ? `, channel id="${scope.channelId}"` : ""}.`
      : "- Scope: tidak ada guild spesifik — jawab umum soal server ini.";
    return `Kamu adalah chatbot Discord Watcher — temen ngobrol yang tau keadaan server, dan kamu PUNYA AKSES ke data server lewat tools.

${scopeLine}

ATURAN PENTING — JANGAN PAKAI KONTEKS STATIS:
- Kamu TIDAK punya hafalan soal angka server (jumlah pesan, user aktif, flagged, dll). JANGAN tebak atau karang angka.
- Untuk SEMUA pertanyaan soal data server (jumlah pesan, user aktif, channel ramai, aktivitas terbaru, pesan di-flag), WAJIB panggil tool yang sesuai (get_server_stats, get_top_channels, get_recent_activity, get_top_flagged). Jawab HANYA dari hasil tool.
- Tool otomatis di-scope ke guild/channel di atas — kalau argumen guildId/channelId kosong, biarkan kosong (sudah otomatis ter-isi). Jangan isi ID yang kamu tebak.
- Kalau tool balas error atau kosong, bilang aja data lagi ga ketemu, jangan karang.

Gaya ngobrol:
- Santai, hangat, kayak ngobrol sama temen
- Pake Bahasa Indonesia sehari-hari, ga perlu kaku
- Sesekali pake emoji wajar aja, ga berlebihan
- Kalo ditanya di luar data server dan kamu ga tau, bilang aja terus tanya balik biar ngobrolnya jalan
- Jangan sebut "rule", "instruksi", "prompt", "tool", atau apapun soal cara kamu berpikir
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
    scope: { guildId?: string; channelId?: string },
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
            // Non-streaming: request a single complete response. omniroute may
            // still emit SSE even with stream:false, so the parser below
            // handle both raw-JSON and SSE bodies.
            stream: false,
            // Disable extended thinking / reasoning tokens so the bot answers
            // directly (ignored by non-reasoning models).
            reasoning_effort: "none",
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            timeout: 45_000,
            responseType: "text",
          },
        );

        // Parse the body into content + tool_calls. omniroute may return either
        // a single JSON object (stream:false honored) or SSE text (stream
        // implied) — parseResponse handles both.
        const { content, toolCalls } = this.parseResponse(
          response.data as string,
        );

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
            // Auto-scope: if the model omitted guildId/channelId, fill them
            // from the request scope so tools query the right server without
            // the model having to guess IDs.
            const scopedArgs = { ...tc.args };
            if (scope.guildId && scopedArgs.guildId == null) {
              scopedArgs.guildId = scope.guildId;
            }
            if (scope.channelId && scopedArgs.channelId == null) {
              scopedArgs.channelId = scope.channelId;
            }
            let result = "";
            try {
              result = await executeTool(tc.name, scopedArgs);
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
   * Parse an LLM HTTP body into content + tool_calls. Handles both shapes
   * omniroute can return: a single JSON object (stream:false honored) or SSE
   * text (stream implied). For SSE we delegate to parseSse.
   */
  private parseResponse(body: string): {
    content: string;
    toolCalls: Array<{
      id: string;
      name: string;
      arguments: string;
      args: Record<string, unknown>;
    }>;
  } {
    const trimmed = body.trim();
    // Non-streaming response: a single JSON object.
    if (trimmed.startsWith("{")) {
      try {
        const json = JSON.parse(trimmed) as {
          choices?: Array<{
            message?: {
              content?: string | null;
              tool_calls?: Array<{
                id?: string;
                type?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
            delta?: unknown;
          }>;
        };
        const msg = json.choices?.[0]?.message;
        // If the router returned SSE-style shape under `choices[].delta`
        // (rare), fall through to the SSE parser.
        if (msg) {
          const content = msg.content ?? "";
          const toolCalls = (msg.tool_calls ?? []).map((tc, i) => {
            const id = tc.id || `tool_${i}_${Date.now()}`;
            return {
              id,
              name: tc.function?.name ?? "",
              arguments: tc.function?.arguments ?? "",
              args: this.safeJsonParse(tc.function?.arguments ?? ""),
            };
          });
          return { content: content.trim(), toolCalls };
        }
      } catch {
        // Not valid JSON after all — treat as SSE below.
      }
    }
    return this.parseSse(body);
  }

  /**
   * Parse an SSE stream body into accumulated content + any tool_calls.
   * omniroute (and most OpenAI-compatible routers) emit `data: {json}` lines
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
