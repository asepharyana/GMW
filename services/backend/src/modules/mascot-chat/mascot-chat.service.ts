import { createChildLogger } from "@bete/shared/logger";
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
    return this.generateResponse(message, context, serverInsights, recentContext);
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

  private async getRecentConversationContext(userId: string): Promise<string[]> {
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

      return rows[0] ?? {
        total_messages: 0,
        active_users: 0,
        flagged: 0,
        warned: 0,
      };
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

  private generateResponse(
    input: string,
    context: MascotChatContext | undefined,
    insights: {
      total_messages: number;
      active_users: number;
      flagged: number;
      warned: number;
    },
    recentContext: string[],
  ): string {
    const lower = input.toLowerCase();
    const messageCount = insights.total_messages || context?.messageCount || 0;
    const activeUsers = insights.active_users || context?.activeParticipants || 0;

    if (lower.includes("ringkasan") || lower.includes("summary")) {
      return `Aku rangkum ya ✨ Ada ${messageCount} pesan dari ${activeUsers} user aktif. Moderasi menemukan ${insights.flagged} flagged dan ${insights.warned} warning. Kesimpulannya: obrolan sedang ${messageCount > 50 ? "ramai" : "cukup tenang"}, dan aku sarankan fokus ke pesan yang punya status warn/flagged dulu.`;
    }

    if (lower.includes("berapa") || lower.includes("jumlah")) {
      if (lower.includes("pesan")) {
        return `Ada ${messageCount} pesan yang tercatat di konteks ini 📊`;
      }
      if (lower.includes("orang") || lower.includes("user")) {
        return `Ada ${activeUsers} user aktif yang ikut dalam obrolan ini 👥`;
      }
    }

    if (lower.includes("flag") || lower.includes("bahaya") || lower.includes("moderasi")) {
      return `Status moderasi: ${insights.flagged} pesan flagged dan ${insights.warned} pesan warning. Kalau mau aman, mulai review dari daftar flagged karena itu prioritas tertinggi 🚨`;
    }

    if (lower.includes("saran") || lower.includes("apa yang harus")) {
      return `Saran mascot: 1) review pesan flagged, 2) cek user paling aktif di Analytics, 3) pantau channel dengan traffic tinggi, 4) kalau obrolan mulai panas, lakukan follow-up manual sebelum eskalasi 🔎`;
    }

    if (lower.includes("halo") || lower.includes("hai") || lower.includes("hi")) {
      return `Halo! Aku siap bantu baca situasi chat. Kamu bisa tanya "ringkasan obrolan", "berapa pesan", atau "ada yang perlu dimoderasi?" 😊`;
    }

    const previousHint = recentContext.length
      ? ` Aku juga mengingat konteks chat mascot sebelumnya (${Math.ceil(recentContext.length / 2)} percakapan terakhir).`
      : "";

    return `Menurutku, pertanyaan "${input}" berkaitan dengan kondisi obrolan saat ini. Data cepat: ${messageCount} pesan, ${activeUsers} user aktif, ${insights.flagged} flagged.${previousHint} Coba tanya lebih spesifik seperti "ringkasan", "moderasi", atau "saran" ya.`;
  }
}

export const mascotChatService = new MascotChatService();
