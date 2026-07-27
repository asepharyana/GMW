import {
  pgCorrectedModerationsTable,
  pgStickerCacheTable,
  pgTextAnalysisCacheTable,
} from "@bete/shared";

// Re-export shared tables
export {
  pgCorrectedModerationsTable,
  pgStickerCacheTable,
  pgTextAnalysisCacheTable,
};
export const correctedModerationsTable = pgCorrectedModerationsTable;
export const stickerCacheTable = pgStickerCacheTable;
export const textAnalysisCacheTable = pgTextAnalysisCacheTable;

// Types
export type StickerCacheRecord = typeof stickerCacheTable.$inferSelect;
export type StickerCacheInsert = typeof stickerCacheTable.$inferInsert;
export type CorrectedModeration = typeof correctedModerationsTable.$inferSelect;
export type CorrectedModerationInsert =
  typeof correctedModerationsTable.$inferInsert;
