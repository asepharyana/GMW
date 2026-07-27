import { z } from "zod";

export const messageQuerySchema = z.object({
  channelId: z.string().optional(),
  guildId: z.string().optional(),
  userId: z.string().optional(),
  status: z.enum(["pending", "clean", "warn", "flagged", "error"]).optional(),
  limit: z.coerce.number().int().positive().default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
  cursor: z.string().optional(),
});

export const messageCreateSchema = z.object({
  guildId: z.string(),
  channelId: z.string(),
  threadId: z.string().optional(),
  userId: z.string(),
  username: z.string(),
  avatarUrl: z.string().optional(),
  content: z.string(),
  type: z.enum(["text", "edited", "deleted"]).default("text"),
  isReply: z.boolean().optional(),
  isForward: z.boolean().optional(),
  isCrosspost: z.boolean().optional(),
  referenceMessageId: z.string().optional(),
  referenceChannelId: z.string().optional(),
  referenceGuildId: z.string().optional(),
});

export const messageUpdateSchema = z.object({
  editedContent: z.string().optional(),
  aiStatus: z.enum(["pending", "clean", "warn", "flagged", "error"]).optional(),
  aiAnalysis: z.string().optional(),
  aiCategories: z.string().optional(),
  aiSeverity: z.enum(["none", "low", "medium", "high", "critical"]).optional(),
  aiConfidence: z.number().optional(),
});

export const reanalyzeBatchSchema = z.object({
  guildId: z.string().optional(),
  channelId: z.string().optional(),
  messageIds: z.array(z.string()).optional(),
});

export type MessageQuery = z.infer<typeof messageQuerySchema>;
export type MessageCreate = z.infer<typeof messageCreateSchema>;
export type MessageUpdate = z.infer<typeof messageUpdateSchema>;
export type ReanalyzeBatchInput = z.infer<typeof reanalyzeBatchSchema>;
