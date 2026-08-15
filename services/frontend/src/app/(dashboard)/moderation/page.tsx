import { getModerationActions, getModerationStats } from "@/lib/api/server";
import { ModerationView } from "./view";

export const dynamic = "force-dynamic";

export default async function ModerationPage() {
  let stats = undefined;
  let actions = undefined;
  try {
    [stats, actions] = await Promise.all([
      getModerationStats(),
      getModerationActions(100),
    ]);
  } catch {
    /* client hooks surface errors */
  }
  return <ModerationView initialStats={stats} initialActions={actions} />;
}
