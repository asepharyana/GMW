import { z } from "zod";

export const analyticsQuerySchema = z.object({
  guildId: z.string(),
  channelId: z.string().optional(),
  hours: z.coerce.number().int().positive().default(24),
});

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
