import { useEffect, useState } from "react";
import type { MessageRecord } from "../api/client";

/**
 * useMascotSummary — Generates AI-powered summary/insights from recent messages
 * Used by mascot's floating chat bubble to display conversation insights
 */

interface UseMascotSummaryOptions {
  messages: MessageRecord[];
  enabled?: boolean;
}

const summaryPrompts = [
  "📊 Diskusi sangat aktif dengan {count} pesan",
  "💬 Topik populer: {topic} ({percentage}%)",
  "👥 Partisipan utama: {users}",
  "⏰ Aktivitas puncak: {time}",
  "🔥 Buzz level: {level}",
  "💡 Insight: {insight}",
];

function generateInsight(messages: MessageRecord[]): string {
  if (messages.length === 0) {
    return "Menunggu pesan...";
  }

  const totalMessages = messages.length;
  const recentMessages = messages.slice(-10);

  // Hitung user yang berbeda
  const uniqueUsers = new Set(recentMessages.map((m) => m.user_id)).size;

  // Hitung average panjang pesan
  const avgLength = Math.round(
    recentMessages.reduce((sum, m) => sum + (m.content?.length || 0), 0) /
      recentMessages.length
  );

  // Tentukan tipe percakapan
  let insight = "";
  if (avgLength > 150) {
    insight = "Diskusi mendalam sedang berlangsung";
  } else if (avgLength > 80) {
    insight = "Percakapan normal dan interaktif";
  } else {
    insight = "Chat cepat dan ringkas";
  }

  // Tambah info partisipan
  if (uniqueUsers > 5) {
    insight += ` • ${uniqueUsers} orang aktif`;
  }

  // Tambah info volume
  if (totalMessages > 50) {
    insight += " • Volume tinggi 🔥";
  } else if (totalMessages > 20) {
    insight += " • Percakapan aktif";
  }

  return insight;
}

function extractTopics(messages: MessageRecord[]): string {
  if (messages.length === 0) return "Tidak ada topik";

  // Extract keywords dari recent messages
  const recentMessages = messages.slice(-15);
  const content = recentMessages
    .map((m) => m.content?.toLowerCase() || "")
    .join(" ");

  // Simple keyword extraction
  const keywords = [
    { word: "voice", label: "Voice" },
    { word: "recording", label: "Recording" },
    { word: "audio", label: "Audio" },
    { word: "chat", label: "Chat" },
    { word: "message", label: "Message" },
    { word: "user", label: "User" },
  ];

  for (const { word, label } of keywords) {
    if (content.includes(word)) {
      return label;
    }
  }

  return "Umum";
}

export function useMascotSummary({
  messages,
  enabled = true,
}: UseMascotSummaryOptions): string {
  const [summary, setSummary] = useState<string>("");

  useEffect(() => {
    if (!enabled || messages.length === 0) {
      setSummary("");
      return;
    }

    // Generate summary berdasarkan messages
    const insight = generateInsight(messages);
    setSummary(insight);

    // Rotate summary setiap 5 detik
    const interval = setInterval(() => {
      setSummary((prev) => {
        if (prev.includes("aktif")) {
          return `📈 Total: ${messages.length} pesan`;
        } else if (prev.includes("Total")) {
          return generateInsight(messages);
        }
        return prev;
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [messages, enabled]);

  return summary;
}
