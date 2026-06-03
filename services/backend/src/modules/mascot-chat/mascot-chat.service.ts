import { createChildLogger } from "@bete/shared/logger";
import { config } from "../../shared/config/index.js";
import { getPool } from "../../shared/database/index.js";

const logger = createChildLogger("mascot-chat.service");

export interface MascotChatContext {
  messageCount?: number;
  activeParticipants?: number;
  lastActivity?: string;
  topicsDiscussed?: string[];
  guildId?: string;
  channelId?: string;
}

export interface SaveConversationInput {
  userId: string;
  userMessage: string;
  mascotResponse: string;
  context?: MascotChatContext;
  timestamp: Date;
}

export interface MascotChatHistoryRow {
  id: string;
  user_id: string;
  user_message: string;
  mascot_response: string;
  context: MascotChatContext | null;
  created_at: string;
}

interface LLMChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

class MascotChatService {
  private initialized = false;

  async processMessage(
    message: string,
    context: MascotChatContext | undefined,
    userId: string,
  ): Promise<string> {
    await this.ensureSchema();

    const recentContext = await this.getRecentConversationContext(userId);
    const serverInsights = await this.getServerInsights(context);

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
    await this.ensureSchema();
    const pool = getPool();

    await pool.query(
      `
        INSERT INTO mascot_chat_messages
          (user_id, user_message, mascot_response, context, created_at)
        VALUES ($1, $2, $3, $4::jsonb, $5)
      `,
      [
        input.userId,
        input.userMessage,
        input.mascotResponse,
        JSON.stringify(input.context ?? {}),
        input.timestamp.toISOString(),
      ],
    );
  }

  async getChatHistory(
    userId: string,
    limit: number,
  ): Promise<MascotChatHistoryRow[]> {
    await this.ensureSchema();
    const pool = getPool();

    const { rows } = await pool.query<MascotChatHistoryRow>(
      `
        SELECT id, user_id, user_message, mascot_response, context, created_at
        FROM mascot_chat_messages
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [userId, limit],
    );

    return rows.reverse();
  }

  async clearChatHistory(userId: string): Promise<void> {
    await this.ensureSchema();
    const pool = getPool();
    await pool.query(`DELETE FROM mascot_chat_messages WHERE user_id = $1`, [
      userId,
    ]);
  }

  private async ensureSchema(): Promise<void> {
    if (this.initialized) return;

    const pool = getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mascot_chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        user_message TEXT NOT NULL,
        mascot_response TEXT NOT NULL,
        context JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_mascot_chat_messages_user_created
      ON mascot_chat_messages (user_id, created_at DESC)
    `);

    this.initialized = true;
    logger.info("Mascot chat schema ready");
  }

  private async getRecentConversationContext(
    userId: string,
  ): Promise<string[]> {
    const history = await this.getChatHistory(userId, 3);
    return history.flatMap((row) => [
      `User: ${row.user_message}`,
      `Mascot: ${row.mascot_response}`,
    ]);
  }

  private async getServerInsights(context?: MascotChatContext) {
    const pool = getPool();
    const guildId = context?.guildId;
    const channelId = context?.channelId;

    try {
      const params: string[] = [];
      const clauses: string[] = [];
      if (guildId) {
        params.push(guildId);
        clauses.push(`guild_id = $${params.length}`);
      }
      if (channelId) {
        params.push(channelId);
        clauses.push(`channel_id = $${params.length}`);
      }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

      const { rows } = await pool.query<{
        total_messages: number;
        active_users: number;
        flagged: number;
        warned: number;
      }>(
        `
          SELECT
            COUNT(*)::int AS total_messages,
            COUNT(DISTINCT user_id)::int AS active_users,
            COUNT(*) FILTER (WHERE ai_status = 'flagged')::int AS flagged,
            COUNT(*) FILTER (WHERE ai_status = 'warn')::int AS warned
          FROM messages
          ${where}
        `,
        params,
      );

      return (
        rows[0] ?? {
          total_messages: 0,
          active_users: 0,
          flagged: 0,
          warned: 0,
        }
      );
    } catch (error) {
      logger.warn({ error }, "Failed to load mascot server insights");
      return {
        total_messages: context?.messageCount ?? 0,
        active_users: context?.activeParticipants ?? 0,
        flagged: 0,
        warned: 0,
      };
    }
  }

  private buildSystemPrompt(insights: {
    total_messages: number;
    active_users: number;
    flagged: number;
    warned: number;
  }): string {
    return `Kamu adalah mascot dari Discord Watcher — asisten moderasi yang ramah dan helpful untuk server Discord.

Data server saat ini:
- Total pesan: ${insights.total_messages}
- User aktif: ${insights.active_users}
- Pesan flagged: ${insights.flagged}
- Pesan warning: ${insights.warned}

Kepribadianmu:
- Ramah, pakai emoji sesekali
- Jawab dalam Bahasa Indonesia
- Berikan jawaban yang informatif berdasarkan data di atas
- Kalau ditanya di luar konteks moderasi/obrolan Discord, tetap jawab dengan sopan tapi arahkan kembali ke topik server
- Jangan mengulangi template jawaban — setiap respons harus natural dan kontekstual
- Jika user menyapa (halo/hai), balas dengan ramah dan tawarkan bantuan`;
  }

  private buildHistoryMessages(recentContext: string[]): LLMChatMessage[] {
    // recentContext is alternating User/Mascot messages
    return recentContext.map((text) => {
      if (text.startsWith("User: ")) {
        return { role: "user" as const, content: text.slice(6) };
      }
      return { role: "assistant" as const, content: text.slice(7) };
    });
  }

  private async callLLM(
    systemPrompt: string,
    history: LLMChatMessage[],
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

      const messages: LLMChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: userMessage },
      ];

      const response = await axios.post(
        `${baseUrl}/chat/completions`,
        {
          model,
          messages,
          max_tokens: 500,
          temperature: 0.7,
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
      return "Halo! Aku mascot Discord Watcher. Ada yang bisa aku bantu soal pantauan server ini? 😊";
    }

    if (
      lower.includes("ringkasan") ||
      lower.includes("summary") ||
      lower.includes("rangkum")
    ) {
      return "Maaf, fitur AI sedang tidak tersedia. Coba tanya lagi nanti ya ✨";
    }

    return "Maaf, aku sedang gagal nyambung ke otakku (LLM) 😅. Coba tanya lagi sebentar lagi ya!";
  }
}

export const mascotChatService = new MascotChatService();
