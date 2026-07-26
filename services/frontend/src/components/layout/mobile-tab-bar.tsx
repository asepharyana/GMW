"use client";

import { LayoutDashboard, MessageSquare, Radio } from "lucide-react";
import { useRouter } from "next/navigation";

const tabs = [
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "live", label: "Live", icon: Radio },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function MobileTabBar({ activeTab }: { activeTab: TabId }) {
  const router = useRouter();

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-10 border-t bg-background">
      <div className="flex">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => router.push(`/dashboard?tab=${id}`)}
            data-active={activeTab === id ? "" : undefined}
            className="flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium text-muted-foreground data-[active]:text-primary transition-colors"
          >
            <Icon className="size-5" />
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}
