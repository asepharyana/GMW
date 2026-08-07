import { z } from "zod";

export const mediaQueueSchema = z.object({
  source: z.string().min(1, "source is required"),
  mode: z.enum(["music", "screen"]).default("music"),
});

export type MediaQueueInput = z.infer<typeof mediaQueueSchema>;
