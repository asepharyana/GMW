import {
  pgAIAnalysisRunsTable,
  pgChannelCulturesTable,
  pgUserProfilesTable,
} from "../../../shared/index.js";

// Re-export shared tables
export { pgAIAnalysisRunsTable, pgChannelCulturesTable, pgUserProfilesTable };
export const aiAnalysisRunsTable = pgAIAnalysisRunsTable;
export const channelCulturesTable = pgChannelCulturesTable;
export const userProfilesTable = pgUserProfilesTable;

// Types
export type AIAnalysisRun = typeof aiAnalysisRunsTable.$inferSelect;
export type AIAnalysisRunInsert = typeof aiAnalysisRunsTable.$inferInsert;
export type ChannelCulture = typeof channelCulturesTable.$inferSelect;
export type ChannelCultureInsert = typeof channelCulturesTable.$inferInsert;
export type UserProfile = typeof userProfilesTable.$inferSelect;
export type UserProfileInsert = typeof userProfilesTable.$inferInsert;
