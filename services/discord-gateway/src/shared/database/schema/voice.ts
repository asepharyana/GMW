import { pgVoiceRecordingsTable } from "@bete/shared";

// Re-export shared table
export { pgVoiceRecordingsTable };
export const voiceRecordingsTable = pgVoiceRecordingsTable;

// Types
export type VoiceRecording = typeof voiceRecordingsTable.$inferSelect;
export type VoiceRecordingInsert = typeof voiceRecordingsTable.$inferInsert;
