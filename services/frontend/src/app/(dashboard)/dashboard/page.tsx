/**
 * Dashboard — Server Component.
 * Fetches initial stats + activity on the server (SSR first paint), hands to
 * the hydrated client View. Keeps the documented server-seed data flow.
 */
import { getActivity, getDashboardStats } from "@/lib/api/server";
import DashboardView from "./view";

export default async function DashboardPage() {
  const [stats, activity] = await Promise.allSettled([
    getDashboardStats().catch(() => undefined),
    getActivity(14).catch(() => undefined),
  ]);

  return (
    <DashboardView
      initialStats={
        stats.status === "fulfilled" && stats.value ? stats.value : undefined
      }
      initialActivity={
        activity.status === "fulfilled" && activity.value
          ? activity.value
          : undefined
      }
    />
  );
}
