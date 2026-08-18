import { PageTransition } from "@/components/shared";
import { getModerationActions, getModerationStats } from "@/lib/api/server";
import { ModerationView } from "./view";

export const dynamic = "force-dynamic";

export default async function ModerationPage() {
  let stats: import("@/lib/types").ModerationStats | undefined;
  let actions: import("@/lib/types").ModerationAction[] | undefined;
  try {
    [stats, actions] = await Promise.all([
      getModerationStats(),
      getModerationActions(100),
    ]);
  } catch {
    /* client hooks surface errors */
  }
  return (
    <PageTransition>
      <ModerationView initialStats={stats} initialActions={actions} />
    </PageTransition>
  );
}
