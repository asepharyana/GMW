import { z } from "zod";

export const mediaQueueSchema = z.object({
  source: z.string().min(1, "source is required"),
  mode: z.enum(["music", "screen"]).default("music"),
});

export const mediaVolumeSchema = z.object({
  volume: z.number().min(0).max(1).default(1.0),
});

export type MediaQueueInput = z.infer<typeof mediaQueueSchema>;
export type MediaVolumeInput = z.infer<typeof mediaVolumeSchema>;
