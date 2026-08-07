import { z } from "zod";

export const mediaQueueSchema = z.object({
  source: z.string().min(1, "source is required"),
  mode: z.enum(["music", "screen"]).default("music"),
});

export const mediaLoopSchema = z.object({
  loop: z.boolean().default(false),
});

export type MediaQueueInput = z.infer<typeof mediaQueueSchema>;
export type MediaLoopInput = z.infer<typeof mediaLoopSchema>;
