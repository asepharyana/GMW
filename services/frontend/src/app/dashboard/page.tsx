"use client";

import { useSearchParams } from "next/navigation";
import { DashboardPanel } from "@/features/dashboard/dashboard-panel";
import { LivePanel } from "@/features/live/live-panel";
import { MessagesPanel } from "@/features/messages/messages-panel";

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") ?? "messages";

  switch (tab) {
    case "live":
      return <LivePanel />;
    case "dashboard":
      return <DashboardPanel />;
    default:
      return <MessagesPanel />;
  }
}
