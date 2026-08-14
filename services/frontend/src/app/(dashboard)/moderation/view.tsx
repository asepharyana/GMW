"use client";

import { ModerationSection } from "@/components/moderation/moderation-section";
import type { ModerationAction, ModerationStats } from "@/lib/types";

export default function ModerationView({
  initialStats,
  initialActions,
}: {
  initialStats?: ModerationStats;
  initialActions?: ModerationAction[];
}) {
  return (
    <ModerationSection
      initialStats={initialStats}
      initialActions={initialActions}
    />
  );
}
