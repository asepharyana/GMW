"use client";

import { Suspense } from "react";

import { Chatbot } from "@/components/chatbot/chatbot";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { WsProvider } from "@/lib/ws/context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WsProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <AppHeader />
          <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center">
                  <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              }
            >
              {children}
            </Suspense>
          </main>
        </div>
        <MobileNav />
      </div>
      <Chatbot />
    </WsProvider>
  );
}
