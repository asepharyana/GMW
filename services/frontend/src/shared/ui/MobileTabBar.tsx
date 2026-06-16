import { LayoutDashboard, MessageSquare, Radio } from "lucide-react";
import type { DashboardTab } from "../../entities/ui/types.js";
import { cn } from "../lib/utils";

const tabs: Array<{ id: DashboardTab; label: string; Icon: typeof Radio }> = [
  { id: "messages", label: "Messages", Icon: MessageSquare },
  { id: "live", label: "Voice & Media", Icon: Radio },
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
];

interface MobileTabBarProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
}

export function MobileTabBar({ activeTab, onTabChange }: MobileTabBarProps) {
  return (
    <nav
      aria-label="Main navigation"
      role="tablist"
      className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-border bg-card shadow-lg md:hidden"
    >
      {tabs.map(({ id, label, Icon }) => (
        <button
          key={id}
          role="tab"
          aria-selected={activeTab === id}
          aria-controls={`tabpanel-${id}`}
          type="button"
          onClick={() => onTabChange(id)}
          className={cn(
            "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors",
            activeTab === id ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Icon className="h-5 w-5" />
          <span className="text-[10px]">{label}</span>
          {activeTab === id && (
            <span
              aria-hidden="true"
              className="h-0.5 w-6 rounded-full bg-primary mx-auto mt-0.5"
            />
          )}
        </button>
      ))}
    </nav>
  );
}
