import { motion } from "framer-motion";
import { LayoutDashboard, MessageSquare, Radio, Settings } from "lucide-react";
import { cn } from "../lib/utils";
import type { DashboardTab } from "../types/ui-types.js";

const tabs: Array<{ id: DashboardTab; label: string; Icon: typeof Radio }> = [
  { id: "messages", label: "Messages", Icon: MessageSquare },
  { id: "live", label: "Voice & Media", Icon: Radio },
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "settings" as const, label: "Admin", Icon: Settings },
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
      className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-border bg-card shadow-lg shadow-black/5 md:hidden"
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
            "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors",
            activeTab === id
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {activeTab === id && (
            <motion.div
              layoutId="tab-indicator"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="absolute -top-px left-1/4 right-1/4 h-0.5 rounded-full bg-primary"
            />
          )}
          <Icon
            className={cn("h-5 w-5", activeTab === id && "drop-shadow-sm")}
          />
          <span className="text-[10px]">{label}</span>
          {activeTab === id && (
            <motion.div
              layoutId="tab-dot"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="h-1 w-1 rounded-full bg-primary mt-0.5"
            />
          )}
        </button>
      ))}
    </nav>
  );
}
