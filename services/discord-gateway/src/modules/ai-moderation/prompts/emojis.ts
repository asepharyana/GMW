/**
 * Custom emoji prompt builders for LLM moderation.
 *
 * Custom emojis are small icon/expression images used for reactions
 * and emotional emphasis. These prompts ensure the model applies
 * appropriate standards — emojis are expressive, not documentary.
 */

export { buildCustomEmojiVisionPrompt } from "./system.js";

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
