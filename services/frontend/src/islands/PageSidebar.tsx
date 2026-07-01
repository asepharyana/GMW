// ─── PageSidebar.tsx — Standalone sidebar island for non-SPA pages ───────────
// Wraps the existing Sidebar widget with URL-based navigation so it can be
// embedded as an Astro island without needing to pass callback functions.
// ──────────────────────────────────────────────────────────────────────────────

import { Sidebar } from "../shared/components/Sidebar.js";
import type { DashboardTab } from "../shared/types/ui-types.js";

const TAB_URLS: Record<DashboardTab, string> = {
  live: "/live",
  messages: "/messages",
  dashboard: "/",
  settings: "/settings",
};

interface PageSidebarProps {
  activeTab: DashboardTab;
}

export default function PageSidebar({ activeTab }: PageSidebarProps) {
  return (
    <Sidebar
      activeTab={activeTab}
      collapsed={false}
      onTabChange={(tab: DashboardTab) => {
        window.location.href = TAB_URLS[tab] || "/messages";
      }}
    />
  );
}
