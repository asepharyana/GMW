import { sql } from "drizzle-orm";
import { getDatabase } from "../../shared/database/index.js";

/**
 * Tools the chatbot LLM can call. Definitions describe the schema to the
 * model; the executor implements each one against the real database.
 * This turns the chatbot from "blind stats guesser" into an agent that
 * pulls real, current server data on demand.
 */

export type ToolResult = string;

/** JSON schema for a tool definition (OpenAI function-calling format). */
export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export const tools: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "get_server_stats",
      description:
        "Ambil statistik ringkas server/guild saat ini: total pesan, user aktif, jumlah pesan flagged, dan jumlah warning. Panggil ini untuk menjawab pertanyaan umum tentang kondisi server. Opsional fill guild_id untuk scope ke guild tertentu, channel_id untuk scope ke channel.",
      parameters: {
        type: "object",
        properties: {
          guildId: {
            type: "string",
            description: "ID guild/server (opsional). Kosongkan = semua data.",
          },
          channelId: {
            type: "string",
            description: "ID channel (opsional).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_channels",
      description:
        "Ambil daftar channel paling aktif (jumlah pesan terbanyak) di server. Panggil buat jawab 'channel mana paling ramai' atau aktivitas per-channel.",
      parameters: {
        type: "object",
        properties: {
          guildId: {
            type: "string",
            description: "ID server (opsional).",
          },
          limit: {
            type: "number",
            description: "Jumlah channel teratas (default 5, max 10).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_activity",
      description:
        "Ambil aktivitas/pesan terbaru di server: siapa yang baru ngomong, di channel mana, jam berapa. Panggil buat jawaban soal 'lagi ngapain' / aktivitas terbaru di server.",
      parameters: {
        type: "object",
        properties: {
          guildId: {
            type: "string",
            description: "ID server (opsional).",
          },
          limit: {
            type: "number",
            description: "Jumlah pesan terakhir (default 5).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_flagged",
      description:
        "Ambil pesan yang paling sering di-flag atau kena warning. Panggil buat jawab soal pesan bermasalah / moderator.",
      parameters: {
        type: "object",
        properties: {
          guildId: {
            type: "string",
            description: "ID server (opsional).",
          },
          limit: {
            type: "number",
            description: "Jumlah pesan (default 5).",
          },
        },
      },
    },
  },
];

/** Executes a tool call against the real DB and returns a readable result. */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const guildId =
    typeof args.guildId === "string" && args.guildId ? args.guildId : undefined;
  const channelId =
    typeof args.channelId === "string" && args.channelId
      ? args.channelId
      : undefined;
  const limitRaw =
    typeof args.limit === "number" ? args.limit : Number(args.limit) || 5;
  const limit = Math.min(Math.max(1, Math.round(limitRaw)), 10);

  try {
    switch (name) {
      case "get_server_stats":
        return await serverStats(guildId, channelId);
      case "get_top_channels":
        return await topChannels(guildId, limit);
      case "get_recent_activity":
        return await recentActivity(guildId, limit);
      case "get_top_flagged":
        return await topFlagged(guildId, limit);
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (error) {
    // Best-effort: if a tool fails, return readable error instead of crashing
    return `Terjadi kesalahan saat ambil data: ${(error as Error).message ?? "unknown"}`;
  }
}

// ── Tool executors ──────────────────────────────────────────

async function serverStats(
  guildId?: string,
  channelId?: string,
): Promise<string> {
  const db = getDatabase();
  const conditions: string[] = [];
  if (guildId) conditions.push(`guild_id = '${guildId}'`);
  if (channelId) conditions.push(`channel_id = '${channelId}'`);
  const cond = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await db.execute(
    sql.raw(
      `SELECT COUNT(*)::int AS total_messages,
              COUNT(DISTINCT user_id)::int AS active_users,
              COUNT(*) FILTER (WHERE ai_status = 'flagged')::int AS flagged,
              COUNT(*) FILTER (WHERE ai_status = 'warn')::int AS warned
       FROM messages ${cond}`,
    ),
  );
  const rows =
    (result as unknown as { rows: Record<string, unknown>[] }).rows ?? [];
  const r = rows[0] ?? {};
  return JSON.stringify({
    total_messages: r.total_messages ?? 0,
    active_users: r.active_users ?? 0,
    flagged: r.flagged ?? 0,
    warned: r.warned ?? 0,
  });
}

async function topChannels(guildId?: string, limit = 5): Promise<string> {
  const db = getDatabase();
  const conditions: string[] = [];
  if (guildId) conditions.push(`guild_id = '${guildId}'`);
  const cond = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await db.execute(
    sql.raw(
      `SELECT channel_id,
              COUNT(*)::int AS count
       FROM messages ${cond}
       GROUP BY channel_id
       ORDER BY count DESC
       LIMIT ${limit}`,
    ),
  );
  const rows = (result as unknown as { rows: unknown[] }).rows ?? [];
  return JSON.stringify(rows.slice(0, limit));
}

async function recentActivity(guildId?: string, limit = 5): Promise<string> {
  const db = getDatabase();
  const conditions: string[] = [];
  if (guildId) conditions.push(`guild_id = '${guildId}'`);
  const cond = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await db.execute(
    sql.raw(
      `SELECT username, content, channel_id, created_at
       FROM messages ${cond}
       ORDER BY created_at DESC
       LIMIT ${limit}`,
    ),
  );
  return JSON.stringify((result as unknown as { rows: unknown[] }).rows ?? []);
}

async function topFlagged(guildId?: string, limit = 5): Promise<string> {
  const db = getDatabase();
  const conditions = ["ai_status IN ('flagged', 'warn')"];
  if (guildId) conditions.push(`guild_id = '${guildId}'`);
  const cond = `WHERE ${conditions.join(" AND ")}`;

  const result = await db.execute(
    sql.raw(
      `SELECT username, content, channel_id, ai_status, created_at
       FROM messages ${cond}
       ORDER BY created_at DESC
       LIMIT ${limit}`,
    ),
  );
  return JSON.stringify((result as unknown as { rows: unknown[] }).rows ?? []);
}
