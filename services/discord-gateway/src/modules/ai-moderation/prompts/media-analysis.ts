/**
 * Media (image/video) analysis prompt builders for LLM moderation.
 *
 * Instructs vision models to objectively describe visual content without
 * making moderation decisions — the main LLM judges, not the vision model.
 */

/**
 * Prompt for analyzing regular images (attachments, embeds, links).
 *
 * VISION MODEL ONLY DESCRIBES — it does NOT decide moderation.
 */
export function buildGeneralImageVisionPrompt(
  sourceLabel: string,
  _messageId: string,
): string {
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
