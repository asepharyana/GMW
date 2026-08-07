/**
 * Dashboard page — Server Component.
 *
 * Fetches y the initial stats + activity on the server (no client round-trip
 * for first paint) and hands them to the hydrated client view. This is the
 * "data on the server" leg of the reworked data flow.
 */
import { getActivity, getDashboardStats } from "@/lib/api/server";
import DashboardView from "./view";

export default async function DashboardPage() {
  const [stats, activity] = await Promise.allSettled([
    getDashboardStats(),
    getActivity(14),
  ]);

  return (
    <DashboardView
      initialStats={stats.status === "fulfilled" ? stats.value : undefined}
      initialActivity={
        activity.status === "fulfilled" ? activity.value : undefined
      }
    />
  );
}
