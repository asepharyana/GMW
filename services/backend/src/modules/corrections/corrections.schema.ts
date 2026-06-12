import { z } from "zod";

export const correctionQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  cursor: z.string().optional(),
});

export const correctionCreateSchema = z.object({
  message_id: z.string().min(1, "message_id is required"),
  original_flags: z
    .array(z.string())
    .min(1, "original_flags must be non-empty"),
  corrected_flags: z
    .array(z.string())
    .min(0)
    .refine(
      (val) => val.length >= 0,
      "corrected_flags must be an array of strings",
    ),
  correction_notes: z.string().optional(),
  content_snippet: z.string().min(1, "content_snippet is required"),
});

export type CorrectionQuery = z.infer<typeof correctionQuerySchema>;
export type CorrectionCreate = z.infer<typeof correctionCreateSchema>;
