"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { Header } from "@/components/layout/header";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { Sidebar } from "@/components/layout/sidebar";
import { MascotChatbot } from "@/features/mascot/mascot-chatbot";
import { uiStateApi } from "@/lib/api";
import { WsProvider } from "@/lib/ws/context";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const restored = useRef(false);

  const activeTab = (searchParams.get("tab") ?? "messages") as
    | "messages"
    | "live"
    | "dashboard";

  // Restore persisted tab on mount (only if no explicit tab in URL)
  useEffect(() => {
    if (restored.current) return;
    const tabParam = searchParams.get("tab");
    if (tabParam) {
      restored.current = true;
      return;
    }
    uiStateApi
      .get()
      .then((state) => {
        restored.current = true;
        const savedTab = state.active_tab;
        if (savedTab && savedTab !== activeTab) {
          router.replace(`/dashboard?tab=${savedTab}`);
        }
      })
      .catch(() => {
        restored.current = true;
      });
  }, [searchParams, activeTab, router]);

  // Persist tab changes
  useEffect(() => {
    if (!restored.current) return;
    uiStateApi.save({ active_tab: activeTab }).catch(() => {});
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar activeTab={activeTab} />
      <div className="md:pl-56 flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">{children}</main>
      </div>
      <MobileTabBar activeTab={activeTab} />
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WsProvider>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center">
            <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        }
      >
        <DashboardShell>{children}</DashboardShell>
      </Suspense>
      <MascotChatbot />
    </WsProvider>
  );
}
