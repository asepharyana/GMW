import type { AiStatus } from "@/lib/types";

export type AiTone = "signal" | "amber" | "vermilion" | "neutral";

/**
 * Map an AI analysis status to a design-system tone.
 */
export function aiTone(s?: AiStatus | null): AiTone {
  if (s === "clean") return "signal";
  if (s === "warn") return "amber";
  if (s === "flagged" || s === "error") return "vermilion";
  return "neutral";
}
