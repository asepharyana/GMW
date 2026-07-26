"use client";

import { LayoutDashboard, MessageSquare, Radio } from "lucide-react";
import { useRouter } from "next/navigation";

const tabs = [
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "live", label: "Live", icon: Radio },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function Sidebar({ activeTab }: { activeTab: TabId }) {
  const router = useRouter();

  const handleTabClick = (tabId: TabId) => {
    router.push(`/dashboard?tab=${tabId}`);
  };

  return (
    <aside className="hidden md:flex md:w-56 md:flex-col md:fixed md:inset-y-0 border-r bg-sidebar">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center">
          <Radio className="size-4 text-primary" />
        </div>
        <span className="font-semibold text-sm">Bete</span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => handleTabClick(id)}
            data-active={activeTab === id ? "" : undefined}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active]:bg-sidebar-accent data-[active]:text-sidebar-accent-foreground"
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
