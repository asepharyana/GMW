"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type TabId, tabs } from "@/lib/tabs";
import { cn } from "@/lib/utils";

export function MobileTabBar({ activeTab }: { activeTab: TabId }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-10 border-t border-border/50 bg-background/80 backdrop-blur-lg">
      <div className="flex">
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString());
                params.set("tab", id);
                router.push(`/dashboard?${params}`);
              }}
              className={cn(
                "flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-all duration-200 relative",
                isActive
                  ? "text-sky-400"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-5" />
              <span>{label}</span>
              {isActive && (
                <span className="absolute -top-px left-1/4 right-1/4 h-0.5 rounded-full bg-gradient-to-r from-sky-400 to-cyan-400" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
