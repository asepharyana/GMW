/**
 * simpleFallback.ts
 *
 * Simple two-step text fallback for cheap/small models.
 * Step 1: Single-word classification (clean/warn/flagged).
 * Step 2: Real analysis text (only if not clean).
 * Extracted from moderationOrchestrator.ts.
 */
import { createChildLogger } from "@bete/shared/logger";
import type {
  AnalysisResult,
  MessageRecord,
} from "../message-capture/types.js";
import { llmChat } from "./llmClient.js";
import { getAnalysisContent } from "./moderationBuilders.js";
import { sanitizeAiContent } from "./moderationPrompt.js";
import { getUserProfile } from "./userProfileStore.js";

const log = createChildLogger("simpleFallback");

// ---------------------------------------------------------------------------
// Simple text-only fallback
// ---------------------------------------------------------------------------

/**
 * Simple two-step text fallback for cheap/small models.
 * Step 1: Single-word classification (clean/warn/flagged).
 * Step 2: Real analysis text (only if not clean).
 */
export async function runSimpleTextFallback(
  message: MessageRecord,
): Promise<AnalysisResult> {
  const content = getAnalysisContent(message);
  const MAX_CONTENT_CHARS = 500;
  const truncatedContent =
    content.length > MAX_CONTENT_CHARS
      ? `${content.slice(0, MAX_CONTENT_CHARS)}...`
      : content;

  let userProfileCtx = "";
  try {
    const profile = await getUserProfile(message.user_id);
    if (profile?.profile_summary) {
      userProfileCtx = `\n\nProfil pengirim pesan:\n${sanitizeAiContent(profile.profile_summary, 3000, false)}\n`;
    }
  } catch {
    /* non-fatal */
  }

  // Step 1: Single-word classification
  const classifyPrompt = `Pesan berikut perlu diklasifikasikan sebagai: clean, warn, atau flagged.

Aturan:
- clean: pesan biasa, percakapan normal, tidak ada pelanggaran
- warn: spam ringan, promosi tidak jelas, atau pelanggaran ringan
- flagged: harassment, SARA, NSFW, judi, ancaman, atau pelanggaran serius

PENTING (False Positive Prevention):
- Slang Indonesia ("anjay", "wkwk", "njir", "gws", dll) dan makian umum ("asu", "anjing", "bangsat") yang TIDAK ditujukan ke orang lain = clean.
- Konten coding/programming (kode, log error, SQL, command line, error message, stack trace, nama library) = clean. JANGAN flag hanya karena ada kata "error" atau "crash" dalam konteks teknis.
- Nama proyek, tools, framework (IMPHNEN, Bete, Cursor, Claude, React, Discord) = clean.
- Percakapan multilingual (campuran Indonesia-Inggris) = clean.
${userProfileCtx}
Pesan: "${truncatedContent}"

Jawab HANYA dengan satu kata: clean, warn, atau flagged`;

  let status: "clean" | "warn" | "flagged";
  try {
    const completion = await llmChat({
      messages: [{ role: "user", content: classifyPrompt }],
      max_tokens: 10,
      temperature: 0.1,
    });
    const raw =
      completion?.choices[0]?.message?.content?.trim().toLowerCase() ?? "";
    if (raw.includes("flagged")) status = "flagged";
    else if (raw.includes("warn")) status = "warn";
    else status = "clean";
    log.info({ messageId: message.id, status, raw }, "Simple fallback step 1");
  } catch (error) {
    log.warn(
      {
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error),
      },
      "Simple fallback step 1 failed — defaulting to clean",
    );
    status = "clean";
  }

  // Step 2: Reason + category (only if not clean)
  let analysis: string;
  let category = "";

  if (status === "clean") {
    analysis = `${message.username ?? "user"}: ${content.length > 200 ? `${content.slice(0, 200)}...` : content}. Percakapan normal, tidak ada pelanggaran.`;
  } else {
    category = status === "flagged" ? "harassment" : "spam";
    const categoryOptions =
      status === "flagged" ? "harassment, gambling, atau sara" : "spam";
    const reasonPrompt = `Pesan berikut telah diklasifikasikan sebagai "${status}".
${userProfileCtx}
Pesan: "${truncatedContent}"

Jelaskan dalam 1-2 kalimat Bahasa Indonesia: APA yang melanggar dan KENAPA. Jangan gunakan kata "mungkin" atau "sepertinya". Jangan tulis ulang pesan. Langsung ke alasan.

Setelah alasan, sebutkan Kategori: ${categoryOptions}

Contoh untuk "flagged":
Mengandung kata kasar terarah ke individu tertentu sebagai hinaan.
Kategori: harassment

Contoh untuk "flagged":
Promosi situs judi online dengan link dan ajakan.
Kategori: gambling

Contoh untuk "warn":
Promosi channel Discord tanpa konteks, berpotensi spam.
Kategori: spam

Contoh untuk "warn":
Bahasa kasar ringan yang tidak terarah.
Kategori: spam`;

    try {
      const completion = await llmChat({
        messages: [{ role: "user", content: reasonPrompt }],
        max_tokens: 80,
        temperature: 0.3,
      });
      analysis = completion?.choices[0]?.message?.content?.trim() ?? "";
      if (!analysis || analysis.length < 5) {
        analysis = `Pesan diklasifikasikan sebagai ${status} oleh sistem moderasi otomatis.`;
      }
      const categoryMatch = analysis.match(/[Kk]ategori:\s*(\w+)/i);
      if (categoryMatch) {
        const parsedCat = categoryMatch[1].toLowerCase();
        if (["harassment", "spam", "gambling", "sara"].includes(parsedCat))
          category = parsedCat;
        analysis = analysis.replace(/[Kk]ategori:\s*\w+\s*/i, "").trim();
      }
      log.info(
        {
          messageId: message.id,
          status,
          category,
          analysis: analysis.slice(0, 100),
        },
        "Simple fallback step 2",
      );
    } catch (error) {
      analysis = `Pesan diklasifikasikan sebagai ${status} oleh sistem moderasi otomatis berdasarkan analisis konten.`;
      log.warn(
        {
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Simple fallback step 2 failed",
      );
    }
  }

  return {
    messageId: message.id,
    status,
    flags: status === "clean" ? [] : [category],
    score: status === "flagged" ? 0.7 : status === "warn" ? 0.4 : 0,
    analysis,
    categories: status === "clean" ? [] : [category],
    severity:
      status === "flagged" ? "medium" : status === "warn" ? "low" : "none",
    confidence: 0.6,
    recommendedAction:
      status === "flagged" ? "review" : status === "warn" ? "warn" : "none",
    policyVersion: "default-simple-2026-06",
    evidence:
      status !== "clean"
        ? [content.length > 120 ? `${content.slice(0, 120)}...` : content]
        : [],
  };
}
