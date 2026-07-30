import { createChildLogger } from "@/shared/logger/index";
import { z } from "zod";

const log = createChildLogger("moderationSchemas");

export const SeveritySchema = z.enum([
  "none",
  "low",
  "medium",
  "high",
  "critical",
]);
export const RecommendedActionSchema = z.enum([
  "none",
  "monitor",
  "warn",
  "review",
  "delete",
  "escalate",
]);

export const ResultItemSchema = z.object({
  message_id: z.union([z.string(), z.number()]).transform(String),
  status: z.enum(["clean", "warn", "flagged"]),
  flags: z.array(z.string()).optional(),
  score: z.number(),
  analysis: z.string().nullable().optional(),
  categories: z.array(z.string()).optional(),
  severity: SeveritySchema.optional(),
  confidence: z.number().optional(),
  recommended_action: RecommendedActionSchema.optional(),
  policy_version: z.string().optional(),
  evidence: z.array(z.string()).optional(),
});

export const ModerationResponseSchema = z.object({
  results: z.array(ResultItemSchema),
});

// Keep log referenced so TS does not tree-shake the logger init
log.debug("moderationSchemas loaded");
