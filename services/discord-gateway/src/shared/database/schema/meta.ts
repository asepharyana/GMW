import {
  pgChatbotMessagesTable,
  pgMuxerJobsTable,
  pgRetentionPoliciesTable,
  pgUIStateTable,
} from "@bete/shared";

// Re-export shared tables
export {
  pgChatbotMessagesTable,
  pgMuxerJobsTable,
  pgRetentionPoliciesTable,
  pgUIStateTable,
};
export const muxerJobsTable = pgMuxerJobsTable;
export const uiStateTable = pgUIStateTable;
export const retentionPoliciesTable = pgRetentionPoliciesTable;
export const chatbotMessagesTable = pgChatbotMessagesTable;

// Types
export type MuxerJob = typeof muxerJobsTable.$inferSelect;
export type MuxerJobInsert = typeof muxerJobsTable.$inferInsert;
export type UIState = typeof uiStateTable.$inferSelect;
export type UIStateInsert = typeof uiStateTable.$inferInsert;
export type RetentionPolicy = typeof retentionPoliciesTable.$inferSelect;
export type RetentionPolicyInsert = typeof retentionPoliciesTable.$inferInsert;
export type ChatbotMessage = typeof chatbotMessagesTable.$inferSelect;
export type ChatbotMessageInsert =
  typeof chatbotMessagesTable.$inferInsert;
