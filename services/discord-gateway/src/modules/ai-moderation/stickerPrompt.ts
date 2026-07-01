import { createChildLogger } from "@bete/shared/logger";

const logger = createChildLogger("stickerPrompt");

/**
 * Sticker-specific prompt templates for AI moderation.
 *
 * Discord stickers are cartoon/meme artwork — not real photos.
 * These prompts give the LLM proper context to avoid false-positive flags
 * based solely on sticker names or cartoon imagery.
 */

/**
 * Prompt used when a sticker image was successfully downloaded (from cache
 * or network) and is being sent to the vision LLM as a base64 image.
 *
 * Explains that stickers are cartoon art, not documentation of real events,
 * and instructs the model to apply looser standards for cartoon content.
 */
export function buildStickerVisionPrompt(
  stickerName: string,
  messageId: string,
): string {
  logger.debug({ stickerName, messageId }, "Building sticker vision prompt");
  return [
    `Analisis sticker Discord berikut sebagai evidence moderasi.`,
    `Sticker "${stickerName}" berasal dari pesan id=${messageId}.`,
    ``,
    `PENTING — Konteks Sticker:`,
    `- Sticker Discord adalah gambar KARTUN/MEME/ILUSTRASI, BUKAN foto atau video nyata.`,
    `- Sticker sering bersifat humor, satir, atau ekspresi emosi yang dilebih-lebihkan.`,
    `- Gambar di sticker bisa menampilkan adegan yang terlihat "keras" (tokoh kartun menginjak sesuatu, ledakan komik, senjata kartun, tokoh berantem) — itu SENI KARTUN, bukan dokumentasi kekerasan atau ancaman nyata.`,
    `- Teks di sticker sering berupa lelucon, sindiran, atau ekspresi khas komunitas — bukan ancaman literal.`,
    ``,
    `Jelaskan isi visual, teks yang terlihat, dan konteks risiko.`,
    `Terapkan standar yang lebih longgar untuk konten kartun/meme:`,
    `- Adegan kartun yang terlihat "keras" ≠ kekerasan nyata → jangan flag "violence" kecuali jelas menargetkan individu/kelompok nyata dengan ancaman serius.`,
    `- Nama sticker yang terdengar provokatif (mis. "Singa injek pejabat") adalah konteks satir/kartun, bukan bukti pelanggaran.`,
    `- Humor/satir/politik kartun ≠ SARA atau hate speech.`,
    `- Sticker yang menampilkan tokoh kartun dalam pose agresif adalah ekspresi/emosi umum di Discord, bukan harassment.`,
    ``,
    `Jawab Bahasa Indonesia, maksimal 3 kalimat. Jangan bilang kurang konteks atau perlu admin cek.`,
  ].join("\n");
}

/**
 * Wrapper for text-only evidence when a sticker image failed to download.
 *
 * Returns a formatted string that explicitly tells the LLM not to flag
 * based on the sticker name alone, since names can sound provocative
 * while the actual cartoon image is harmless.
 */
export function buildStickerTextOnlyWarning(
  stickerName: string,
  stickerUrl: string,
): string {
  logger.debug(
    { stickerName, stickerUrl },
    "Building sticker text-only warning",
  );
  return (
    `[sticker: "${stickerName}" (${stickerUrl}) — GAMBAR GAGAL DIUNDUH. ` +
    `"${stickerName}" adalah sticker kartun/meme Discord. ` +
    `JANGAN flag berdasarkan nama sticker saja tanpa gambar visual. ` +
    `Sticker Discord adalah seni kartun/ekspresi humor, bukan foto nyata. ` +
    `Nama yang terdengar provokatif adalah hal umum untuk sticker satir/humor di Discord.]`
  );
}

/**
 * Build a neutral fallback text when an image/video attachment cannot be
 * downloaded or analyzed. Unlike the sticker warning, this is deliberately
 * neutral — it only records *that* an attachment existed, without any
 * instruction to the LLM about how to treat it. The absence of visual
 * data already means the LLM must rely on message content alone.
 *
 * Returns a formatted string for inclusion in the media context block.
 */
export function buildAttachmentTextOnlyWarning(
  filename: string,
  messageId: string,
): string {
  const fallback = `[attachment: "${filename}" dari pesan id=${messageId} — tidak tersedia untuk analisis visual]`;
  logger.debug({ filename, messageId }, "Built attachment text-only fallback");
  return fallback;
}

/**
 * Prompt used when a custom emoji image was successfully downloaded
 * and is being sent to the vision LLM as a base64 image.
 *
 * Custom emojis are small icons — context is similar to stickers.
 */
export function buildCustomEmojiVisionPrompt(
  emojiName: string,
  messageId: string,
): string {
  logger.debug({ emojiName, messageId }, "Building custom emoji vision prompt");
  return [
    `Analisis custom emoji Discord berikut sebagai evidence moderasi.`,
    `Emoji "${emojiName}" berasal dari pesan id=${messageId}.`,
    ``,
    `PENTING — Konteks Custom Emoji:`,
    `- Custom emoji Discord adalah ikon kecil/ekspresi, BUKAN foto atau dokumen nyata.`,
    `- Emoji sering digunakan untuk ekspresi emosi, reaksi, atau lelucon.`,
    `- Jangan flag berdasarkan nama emoji saja — analisis isi visual gambar.`,
    `- Emoji yang terlihat lucu/aneh adalah hal umum di Discord, bukan pelanggaran.`,
    ``,
    `Jelaskan isi visual dan konteks risiko.`,
    `Jawab Bahasa Indonesia, maksimal 2 kalimat. Jangan bilang kurang konteks.`,
  ].join("\n");
}

/**
 * Fallback text for when a custom emoji image failed to download.
 */
export function buildCustomEmojiTextOnlyFallback(emojiName: string): string {
  logger.debug({ emojiName }, "Building custom emoji text-only fallback");
  return (
    `[custom_emoji: "${emojiName}" — GAMBAR GAGAL DIUNDUH. ` +
    `"${emojiName}" adalah custom emoji Discord (ikon kecil). ` +
    `JANGAN flag berdasarkan nama emoji saja tanpa gambar visual. ` +
    `Custom emoji di Discord adalah ekspresi/emosi umum, bukan konten ofensif.]`
  );
}

/**
 * Prompt for analyzing regular images (attachments, embeds, links).
 *
 * VISION MODEL ONLY DESCRIBES — it does NOT decide moderation.
 * The main text LLM makes all moderation decisions using the description.
 */
export function buildGeneralImageVisionPrompt(
  sourceLabel: string,
  _messageId: string,
): string {
  logger.debug({ sourceLabel }, "Building general image vision prompt");
  return [
    `Deskripsikan gambar ini secara objektif dan spesifik.`,
    `${sourceLabel}`,
    ``,
    `Jelaskan HANYA apa yang kamu LIHAT:`,
    `- Objek utama apa yang ada di gambar?`,
    `- Teks apa yang terlihat? (tulis persis jika bisa dibaca)`,
    `- Warna dominan dan layout/tata letak?`,
    `- Apakah ini screenshot, foto, meme, kartun, atau dokumen?`,
    `- Konteks: apakah terlihat seperti aplikasi chat, terminal/console,`,
    `  media sosial, game, website, editor kode, dokumen, atau lainnya?`,
    ``,
    `PENTING — Deskripsi saja, JANGAN MEMUTUSKAN MODERASI:`,
    `- JANGAN sebut "gambling", "judi", "pelanggaran", "melanggar", atau flag apapun.`,
    `- JANGAN bilang "harus dihapus", "harus diblokir", atau rekomendasi tindakan.`,
    `- Tugasmu HANYA mendeskripsikan isi gambar. BUKAN menilai.`,
    `- Screenshot terminal/console/shell/editor kode → deskripsikan sebagai "terminal/console".`,
    `- Screenshot aplikasi chat (Discord/WA/Telegram/dll) → deskripsikan sebagai "aplikasi chat".`,
    `- Screenshot website dengan grafik/chart → deskripsikan kontennya secara faktual.`,
    `- JANGAN PERNAH mengklaim gambar adalah "situs judi" atau "antarmuka perjudian".`,
    `  Itu BUKAN tugasmu. Kamu hanya perlu menyebutkan: "tampilan website dengan grafik",`,
    `  "screenshot terminal", "aplikasi chat dengan teks percakapan", dll.`,
    ``,
    `Format jawaban: Deskripsi singkat 2-3 kalimat dalam Bahasa Indonesia.`,
    `Mulai dengan menyebutkan JENIS gambar (screenshot/foto/kartun/dokumen).`,
  ].join("\n");
}
