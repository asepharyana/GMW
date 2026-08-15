import { getActivity, getDashboardStats } from "@/lib/api/server";
import { DashboardView } from "./view";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let stats = undefined;
  let activity = undefined;
  try {
    [stats, activity] = await Promise.all([getDashboardStats(), getActivity(14)]);
  } catch {
    // Backend unavailable — client hooks will surface the error state.
  }
  return <DashboardView initialStats={stats} initialActivity={activity} />;
}
