import {
  pgMascotChatMessagesTable,
  pgMuxerJobsTable,
  pgRetentionPoliciesTable,
  pgUIStateTable,
} from "@bete/shared";

// Re-export shared tables
export {
  pgMascotChatMessagesTable,
  pgMuxerJobsTable,
  pgRetentionPoliciesTable,
  pgUIStateTable,
};
export const muxerJobsTable = pgMuxerJobsTable;
export const uiStateTable = pgUIStateTable;
export const retentionPoliciesTable = pgRetentionPoliciesTable;
export const mascotChatMessagesTable = pgMascotChatMessagesTable;

// Types
export type MuxerJob = typeof muxerJobsTable.$inferSelect;
export type MuxerJobInsert = typeof muxerJobsTable.$inferInsert;
export type UIState = typeof uiStateTable.$inferSelect;
export type UIStateInsert = typeof uiStateTable.$inferInsert;
export type RetentionPolicy = typeof retentionPoliciesTable.$inferSelect;
export type RetentionPolicyInsert = typeof retentionPoliciesTable.$inferInsert;
export type MascotChatMessage = typeof mascotChatMessagesTable.$inferSelect;
export type MascotChatMessageInsert =
  typeof mascotChatMessagesTable.$inferInsert;
