"use client";

import { Suspense } from "react";

import { Header } from "@/components/layout/header";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { Sidebar } from "@/components/layout/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { MascotChatbot } from "@/components/mascot/mascot-chatbot";
import { WsProvider } from "@/lib/ws/context";

function LoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading dashboard…</p>
      </div>
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
      <SidebarProvider defaultOpen={true}>
        <div className="flex min-h-screen bg-background">
          <Sidebar />
          <SidebarInset className="flex flex-col">
            <Header />
            <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 animate-fade-in-up">
              <Suspense fallback={<LoadingFallback />}>{children}</Suspense>
            </main>
          </SidebarInset>
          <MobileTabBar />
        </div>
      </SidebarProvider>
      <MascotChatbot />
    </WsProvider>
  );
}
