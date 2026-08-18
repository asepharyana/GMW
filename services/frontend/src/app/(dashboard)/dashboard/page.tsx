import { PageTransition } from "@/components/shared";
import { getActivity, getDashboardStats } from "@/lib/api/server";
import { DashboardView } from "./view";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let stats: Awaited<ReturnType<typeof getDashboardStats>> | undefined;
  let activity: Awaited<ReturnType<typeof getActivity>> | undefined;
  try {
    [stats, activity] = await Promise.all([
      getDashboardStats(),
      getActivity(14),
    ]);
  } catch {
    // Backend unavailable — client hooks will surface the error state.
  }
  return (
    <PageTransition>
      <DashboardView initialStats={stats} initialActivity={activity} />
    </PageTransition>
  );
}
