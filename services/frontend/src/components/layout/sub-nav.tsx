"use client";

import { cn } from "@/lib/utils";

interface SubNavTab {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface SubNavProps {
  tabs: SubNavTab[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  className?: string;
}

export function SubNav({ tabs, activeTab, onTabChange, className }: SubNavProps) {
  return (
    <div className={cn("flex items-center gap-1 px-1 py-1 glass rounded-[var(--radius-panel)] w-fit", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150",
            activeTab === tab.id
              ? "bg-primary/20 text-text-primary shadow-[0_0_12px] shadow-primary/20"
              : "text-text-secondary/60 hover:text-text-primary/80",
          )}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
