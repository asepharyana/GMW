import { z } from "zod";

export const contextSchema = z.object({
  messageCount: z.number().int().nonnegative().optional(),
  activeParticipants: z.number().int().nonnegative().optional(),
  lastActivity: z.string().datetime().optional(),
  topicsDiscussed: z.array(z.string()).optional(),
  guildId: z.string().optional(),
  channelId: z.string().optional(),
});

export const chatRequestSchema = z.object({
  message: z.string().min(1, "Message is required"),
  context: contextSchema.optional(),
});

export const chatResponseSchema = z.object({
  response: z.string(),
  timestamp: z.string(),
});

export const chatHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type ChatContext = z.infer<typeof contextSchema>;
export type ChatHistoryQuery = z.infer<typeof chatHistoryQuerySchema>;
