/**
 * Moderation page — Server Component. Seeds summary + action log from
 * server-fetched moderation state (shared across all users).
 */
import { ModerationSection } from "@/components/moderation/moderation-section";
import { getModerationActions, getModerationStats } from "@/lib/api/server";

export default async function ModerationPage() {
  const [stats, actions] = await Promise.allSettled([
    getModerationStats(),
    getModerationActions(100),
  ]);

  return (
    <div className="space-y-4 animate-fade-in-up">
      <ModerationSection
        initialStats={stats.status === "fulfilled" ? stats.value : undefined}
        initialActions={
          actions.status === "fulfilled" ? actions.value : undefined
        }
      />
    </div>
  );
}
