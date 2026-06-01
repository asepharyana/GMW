import { BarChart3, MessageSquare, Radio } from "lucide-react";
import type { DashboardTab } from "../entities/ui/types";
import { cn } from "../shared/lib/utils";
import { Button } from "../shared/ui";

const navItems: Array<{ id: DashboardTab; label: string; icon: typeof Radio }> = [
  { id: "live", label: "Live", icon: Radio },
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
];

interface SidebarProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  collapsed?: boolean;
}

export function Sidebar({ activeTab, onTabChange, collapsed }: SidebarProps) {
  return (
    <aside
      className={cn(
        "hidden shrink-0 border-r border-border bg-card/60 p-5 backdrop-blur transition-all duration-300 md:block",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div className={cn("mb-8 flex items-center gap-3", collapsed && "justify-center")}>
        {!collapsed && (
          <div>
            <div className="flex items-baseline gap-2">
              <img src="/logo.svg" alt="GMW" className="h-10 w-10 rounded-2xl" />
              <span className="font-bold tracking-tight text-primary text-lg">GMW</span>
            </div>
            <div className="text-xs text-muted-foreground">Discord Moderation Watcher</div>
          </div>
        )}
        {collapsed && <img src="/logo.svg" alt="GMW" className="h-9 w-9 rounded-xl" />}
      </div>
      <nav className="space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.id}
              variant={activeTab === item.id ? "secondary" : "ghost"}
              className={cn("w-full justify-start", activeTab === item.id && "bg-primary/15 text-primary", collapsed && "justify-center px-0")}
              onClick={() => onTabChange(item.id)}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-4 w-4" />
              {!collapsed && item.label}
            </Button>
          );
        })}
      </nav>
    </aside>
  );
}
