import { z } from "zod";

// ─── Input schemas ────────────────────────────────────────────────

export const createMateriSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(2000).optional(),
  content: z.string().min(1, "Content is required"),
  category: z.string().max(100).default("general"),
  tags: z.array(z.string().max(50)).max(20).default([]),
  guildId: z.string().optional(),
  channelId: z.string().optional(),
  isPublic: z.boolean().default(true),
});

export const updateMateriSchema = createMateriSchema.partial();

export const materiQuerySchema = z.object({
  limit: z.coerce.number().int().positive().default(20),
  search: z.string().optional(),
  category: z.string().optional(),
  ownerId: z.string().optional(),
  onlyPublic: z.boolean().default(false),
});

export const materiRagChatSchema = z.object({
  message: z.string().min(1, "Message is required"),
  materiId: z.string().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .max(20)
    .default([]),
});

export type CreateMateriInput = z.infer<typeof createMateriSchema>;
export type UpdateMateriInput = z.infer<typeof updateMateriSchema>;
export type MateriQueryInput = z.infer<typeof materiQuerySchema>;
export type MateriRagChatInput = z.infer<typeof materiRagChatSchema>;
