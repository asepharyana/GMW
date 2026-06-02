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
  return (
    `[sticker: "${stickerName}" (${stickerUrl}) — GAMBAR GAGAL DIUNDUH. ` +
    `"${stickerName}" adalah sticker kartun/meme Discord. ` +
    `JANGAN flag berdasarkan nama sticker saja tanpa gambar visual. ` +
    `Sticker Discord adalah seni kartun/ekspresi humor, bukan foto nyata. ` +
    `Nama yang terdengar provokatif adalah hal umum untuk sticker satir/humor di Discord.]`
  );
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
  return (
    `[custom_emoji: "${emojiName}" — GAMBAR GAGAL DIUNDUH. ` +
    `"${emojiName}" adalah custom emoji Discord (ikon kecil). ` +
    `JANGAN flag berdasarkan nama emoji saja tanpa gambar visual. ` +
    `Custom emoji di Discord adalah ekspresi/emosi umum, bukan konten ofensif.]`
  );
}

/**
 * Prompt used for general attachment/web images (not stickers or emojis).
 *
 * This is the default prompt for analyzing regular images. It includes
 * explicit guidance on gambling detection to prevent false positives
 * (e.g., flagging screenshots of food, finance, or casual content as gambling).
 */
export function buildGeneralImageVisionPrompt(
  sourceLabel: string,
  messageId: string,
): string {
  return [
    `Analisis media Discord berikut sebagai evidence moderasi.`,
    `${sourceLabel}`,
    ``,
    `PENTING — Panduan Deteksi Pelanggaran:`,
    ``,
    `**Gambling/Judi:**`,
    `- HANYA flag jika gambar JELAS menampilkan promosi atau antarmuka situs judi/taruhan nyata (poker, slots, sports betting).`,
    `- Screenshot Discord/WhatsApp/Telegram/media sosial/chat biasa BUKAN situs judi — jangan flag.`,
    `- Cryptocurrency UI atau finance apps (Coinbase, Binance, exchange) BUKAN judi — jangan flag sebagai gambling.`,
    `- Screenshot ekonomi game, NFT marketplace, atau trading UI BUKAN judi — jangan flag.`,
    `- Gambar makanan, meme, selfie, pemandangan atau konten casual TIDAK PERNAH gambling, bahkan jika ada teks finansial.`,
    `- Hanya flag gambling jika ada BUKTI VISUAL JELAS: tombol taruhan, odds, chips, roulette wheel, atau branding situs judi terkenal.`,
    `- Jika tidak yakin apakah sebuah gambar menampilkan situs judi atau sekadar aplikasi biasa → pilih "Tidak ada indikasi pelanggaran."`,
    ``,
    `**Illegal Content:**`,
    `- Jangan flag berdasarkan kecurigaan. HANYA flag jika ada BUKTI VISUAL JELAS dari konten ilegal (narkoba, senjata, dokumen palsu).`,
    ``,
    `**Sexual Content & NSFW:**`,
    `- Jangan flag foto casual/fashion hanya karena ada bagian tubuh. Flag HANYA jika gambar eksplisit atau pornografi.`,
    ``,
    `**Violence:**`,
    `- Screenshot game/anime action BUKAN kekerasan nyata — jangan flag.`,
    `- Jangan flag meme atau karya seni yang menampilkan adegan dramatik.`,
    ``,
    `Jelaskan isi visual, teks yang terlihat, dan konteks risiko.`,
    `Jawab Bahasa Indonesia, maksimal 3 kalimat. Jangan bilang kurang konteks atau perlu admin cek; berikan observasi langsung dari media.`,
    `Jika gambar tampak aman/tidak ada risiko, tulis: "Tidak ada indikasi pelanggaran terdeteksi."`,
  ].join("\n");
}
