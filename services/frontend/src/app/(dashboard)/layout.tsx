"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, useEffect, useState } from "react";
import { TopNav } from "@/components/layout/top-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { WsProvider, useWebSocket } from "@/lib/ws/context";
import { ChatbotProvider, useChatbot } from "@/components/chatbot/chatbot-context";
import { ChatbotContainer } from "@/components/chatbot/chatbot-container";
import { MiniPlayer } from "@/components/media/mini-player";
import { MediaPlayerProvider } from "@/lib/hooks/use-media-player";
import { HiddenSidebar } from "@/components/layout/hidden-sidebar";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ChatbotExpressionSync() {
  const ws = useWebSocket();
  const { setExpression } = useChatbot();

  useEffect(() => {
    const unsub1 = ws.on("message_created", (data: any) => {
      if (data.ai_status === "flagged" || data.ai_status === "warn") {
        setExpression("surprise");
        setTimeout(() => setExpression("idle"), 2000);
      }
    });

    const unsub2 = ws.on("voice_active_user", () => {
      setExpression("listening");
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, [ws, setExpression]);

  return null;
}

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
          <ChatbotProvider>
            <ChatbotExpressionSync />
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
              <ChatbotContainer />
            </div>
          </ChatbotProvider>
        </MediaPlayerProvider>
      </WsProvider>
    </QueryClientProvider>
  );
}
