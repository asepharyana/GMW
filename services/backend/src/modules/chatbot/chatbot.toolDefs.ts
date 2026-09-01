/**
 * Static tool *definitions* for the chatbot LLM (OpenAI function-calling
 * format). Kept separate from the executor (chatbot.tools.ts) so the schema
 * the model depends on can be imported without pulling in the database /
 * config layer.
 *
 * The chatbot is a server-watcher agent: it can answer about ANY server
 * situation — activity, moderation queue, specific users, channels, voice
 * recordings, AI correction history, and trends over time — by calling these
 * tools, which the executor implements against real tables.
 */

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
        "Ambil statistik ringkas server/guild: total pesan, user aktif, jumlah pesan flagged, warn, dan clean. Panggil untuk jawab pertanyaan umum soal kondisi server. guildId/channelId otomatis ter-isi dari scope; kosongkan untuk semua data.",
      parameters: {
        type: "object",
        properties: {
          guildId: { type: "string", description: "ID server (opsional)." },
          channelId: { type: "string", description: "ID channel (opsional)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_channels",
      description:
        "Ambil daftar channel paling aktif (jumlah pesan terbanyak). Panggil untuk 'channel mana paling ramai' atau aktivitas per-channel.",
      parameters: {
        type: "object",
        properties: {
          guildId: { type: "string", description: "ID server (opsional)." },
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
        "Ambil pesan terbaru di server: siapa, di channel mana, jam berapa, isinya. Panggil untuk 'lagi ngapain' / aktivitas terbaru.",
      parameters: {
        type: "object",
        properties: {
          guildId: { type: "string", description: "ID server (opsional)." },
          channelId: { type: "string", description: "ID channel (opsional)." },
          limit: {
            type: "number",
            description: "Jumlah pesan terakhir (default 5, max 20).",
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
        "Ambil pesan dengan ai_status flagged (beserta alasan, severity, analysis). Panggil untuk bahas pesan bermasalah / kerjaan moderator.",
      parameters: {
        type: "object",
        properties: {
          guildId: { type: "string", description: "ID server (opsional)." },
          channelId: { type: "string", description: "ID channel (opsional)." },
          limit: { type: "number", description: "Jumlah pesan (default 5)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_messages",
      description:
        "Cari pesan berdasarkan kata kunci di isi pesan (case-insensitive, LIKE). Untuk 'ada yang bahas X gak?' / temukan topik tertentu. Hindari kata terlalu umum.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Kata kunci pencarian (wajib).",
          },
          guildId: { type: "string", description: "ID server (opsional)." },
          channelId: { type: "string", description: "ID channel (opsional)." },
          limit: { type: "number", description: "Jumlah hasil (default 5)." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_messages",
      description:
        "Ambil pesan terbaru dari satu user tertentu (user_id), opsional di-scope ke guild/channel. Untuk 'chat si A gimana akhir-akhir ini?' — butuh user_id.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "ID user (wajib)." },
          guildId: { type: "string", description: "ID server (opsional)." },
          channelId: { type: "string", description: "ID channel (opsional)." },
          limit: { type: "number", description: "Jumlah pesan (default 10)." },
        },
        required: ["userId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_profile",
      description:
        "Ambil ringkasan profil AI dari seorang user (pola perilaku, gaya bicara) dari tabel user_profiles. Untuk 'siapa si A?' / konteks perilaku. Butuh user_id.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "ID user (wajib)." },
          guildId: { type: "string", description: "ID server (opsional)." },
        },
        required: ["userId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_reputation",
      description:
        "Cek status skor reputasi per-user. CATATAN: fitur trust score per-user telah dihapus dari sistem — tool ini menjawab 'unavailable' dan menyarankan rasio flag vs total sebagai pengganti.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "ID user (wajib)." },
          guildId: { type: "string", description: "ID server (opsional)." },
        },
        required: ["userId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_channel_culture",
      description:
        "Ambil ringkasan norma/slang channel dari tabel channel_cultures (AI-generated). Untuk 'norma channel ini gimana?' / konteks sebelum nge-flag. Butuh channel_id.",
      parameters: {
        type: "object",
        properties: {
          channelId: { type: "string", description: "ID channel (wajib)." },
        },
        required: ["channelId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_message_detail",
      description:
        "Ambil 1 pesan lengkap beserta hasil analisis AI-nya (status, flags, score, severity, kategori, analysis, recommended action). Untuk jelasin keputusan moderasi pada pesan tertentu. Butuh message_id.",
      parameters: {
        type: "object",
        properties: {
          messageId: { type: "string", description: "ID pesan (wajib)." },
        },
        required: ["messageId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_message_reviews",
      description:
        "Ambil antrean review moderasi manual (message_reviews) berdasarkan status: pending/approved/rejected/escalated. Untuk 'ada review moderasi pending?' / cek kerjaan human moderator. guildId otomatis ter-isi.",
      parameters: {
        type: "object",
        properties: {
          guildId: { type: "string", description: "ID server (opsional)." },
          status: {
            type: "string",
            description:
              "Status review: pending / approved / rejected / escalated (opsional, default semua).",
          },
          limit: { type: "number", description: "Jumlah (default 10)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_voice_recordings",
      description:
        "Ambil rekaman suara terbaru (voice_recordings): user, channel, transkripsi, status upload. Untuk 'ada rekaman suara terbaru?' / cek transkripsi. Bisa di-scope ke user_id atau channel_id.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "Filter user (opsional)." },
          channelId: {
            type: "string",
            description: "Filter channel (opsional).",
          },
          guildId: { type: "string", description: "ID server (opsional)." },
          limit: { type: "number", description: "Jumlah (default 10)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_moderation_timeline",
      description:
        "Ambil tren harian: per hari, jumlah total pesan vs flagged vs warn vs clean. Untuk 'minggu ini pelanggaran naik?' / lihat tren moderasi. guildId otomatis ter-isi.",
      parameters: {
        type: "object",
        properties: {
          guildId: { type: "string", description: "ID server (opsional)." },
          channelId: { type: "string", description: "ID channel (opsional)." },
          days: {
            type: "number",
            description: "Jumlah hari ke belakang (default 14, max 60).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_corrections",
      description:
        "Ambil riwayat koreksi false-positive AI (corrected_moderations): pesan yang awalnya di-flag tapi dikoreksi manusia, beserta alasannya. Untuk 'AI pernah salah nge-flag apa aja?' / audit akurasi moderasi.",
      parameters: {
        type: "object",
        properties: {
          guildId: { type: "string", description: "ID server (opsional)." },
          limit: { type: "number", description: "Jumlah (default 10)." },
        },
      },
    },
  },
];
