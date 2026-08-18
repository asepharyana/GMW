"use client";

import { SkeletonPanel } from "@/components/shared";
import { TermGlossary } from "@/components/TermGlossary";
import { useGlossary } from "@/hooks";
import type { GlossaryRow } from "@/lib/types";

export function GlossaryView({
  initialTerms,
}: {
  initialTerms?: GlossaryRow[];
}) {
  const { data: terms } = useGlossary(100, initialTerms);
  return terms ? <TermGlossary terms={terms} /> : <SkeletonPanel rows={6} />;
}
