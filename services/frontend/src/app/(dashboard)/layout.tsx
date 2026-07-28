"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense } from "react";
import { TopNav } from "@/components/layout/top-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { WsProvider } from "@/lib/ws/context";
import { MascotProvider } from "@/components/mascot/mascot-context";
import { MascotContainer } from "@/components/mascot/mascot-container";
import { MiniPlayer } from "@/components/media/mini-player";
import { MediaPlayerProvider } from "@/lib/hooks/use-media-player";
import { HiddenSidebar } from "@/components/layout/hidden-sidebar";
import { useState } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [guildId, setGuildId] = useState("");

  return (
    <QueryClientProvider client={queryClient}>
      <WsProvider>
        <MediaPlayerProvider>
          <MascotProvider>
            <div className="min-h-screen bg-canvas">
              <TopNav />
              <HiddenSidebar guildId={guildId} onGuildChange={(g) => setGuildId(g ?? "")} />

              {/* Sub-nav space — filled per-page */}
              <div className="pt-11">
                <main className="p-4 md:p-6 pb-24 md:pb-6 max-w-[1600px] mx-auto">
                  <Suspense
                    fallback={
                      <div className="flex h-[60vh] items-center justify-center">
                        <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                      </div>
                    }
                  >
                    {children}
                  </Suspense>
                </main>
              </div>

              <MobileNav />
              <MiniPlayer />
              <MascotContainer />
            </div>
          </MascotProvider>
        </MediaPlayerProvider>
      </WsProvider>
    </QueryClientProvider>
  );
}
