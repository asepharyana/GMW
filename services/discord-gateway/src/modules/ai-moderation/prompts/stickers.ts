/**
 * Sticker analysis prompt builders for LLM moderation.
 *
 * Stickers are cartoon/meme illustrations, NOT real photos or video.
 * These prompts ensure the vision model applies looser standards for
 * cartoon content and does not flag exaggerated cartoon expressions
 * as real violence or harassment.
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
 */
export function buildStickerTextOnlyWarning(
  stickerName: string,
  stickerUrl: string,
): string {
  return (
    `[sticker: "${stickerName}" (${stickerUrl}) — GAMBAR GAGAL DIUNDUH. ` +
    `"${stickerName}" adalah sticker kartun/meme Discord. ` +
    `JANGAN flag berdasarkan nama sticker saja tanpa gambar visual. ` +
    `Sticker Discord adalah seni kartun/ekspresi humor, bukan foto nyata. ` +
    `Nama yang terdengar provokatif adalah hal umum untuk sticker satir/humor di Discord.]`
  );
}
