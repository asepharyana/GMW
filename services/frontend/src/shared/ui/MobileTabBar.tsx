import { MessageSquare, Radio, SlidersHorizontal } from "lucide-react";
import type { DashboardTab } from "../../entities/ui/types";
import { cn } from "../lib/utils";

const tabs: Array<{ id: DashboardTab; label: string; Icon: typeof Radio }> = [
  { id: "live", label: "Live", Icon: Radio },
  { id: "messages", label: "Messages", Icon: MessageSquare },
  { id: "tuner", label: "Tuner", Icon: SlidersHorizontal },
];

interface MobileTabBarProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
}

export function MobileTabBar({ activeTab, onTabChange }: MobileTabBarProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-primary/20 bg-white rounded-t-xl md:hidden">
      {tabs.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onTabChange(id)}
          className={cn(
            "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors",
            activeTab === id ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Icon className="h-5 w-5" />
          <span className="text-[10px]">{label}</span>
        </button>
      ))}
    </nav>
  );
}
