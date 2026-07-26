"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type TabId, tabs } from "@/lib/tabs";

export function MobileTabBar({ activeTab }: { activeTab: TabId }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-10 border-t bg-background">
      <div className="flex">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("tab", id);
              router.push(`/dashboard?${params}`);
            }}
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
