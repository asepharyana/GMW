import { z } from "zod";

export const searchQuerySchema = z.object({
  q: z.string().default(""),
  channelId: z.string().optional(),
  guildId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
