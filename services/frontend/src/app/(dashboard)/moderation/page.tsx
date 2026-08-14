/**
 * Moderation — Server Component.
 * Seeds moderation stats + action log for SSR first paint; live via WS.
 */
import { getModerationActions, getModerationStats } from "@/lib/api/server";
import ModerationView from "./view";

export default async function ModerationPage() {
  const [stats, actions] = await Promise.allSettled([
    getModerationStats().catch(() => undefined),
    getModerationActions(100).catch(() => undefined),
  ]);
  return (
    <ModerationView
      initialStats={
        stats.status === "fulfilled" && stats.value ? stats.value : undefined
      }
      initialActions={
        actions.status === "fulfilled" && actions.value
          ? actions.value
          : undefined
      }
    />
  );
}
