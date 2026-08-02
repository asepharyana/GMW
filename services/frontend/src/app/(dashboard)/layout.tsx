"use client";

import { Suspense, useEffect, useState } from "react";
import { SWRConfig } from "swr";
import { ChatbotContainer } from "@/components/chatbot/chatbot-container";
import {
  ChatbotProvider,
  useChatbot,
} from "@/components/chatbot/chatbot-context";
import { HiddenSidebar } from "@/components/layout/hidden-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { TopNav } from "@/components/layout/top-nav";
import { MiniPlayer } from "@/components/media/mini-player";
import { MediaPlayerProvider } from "@/lib/hooks/use-media-player";
import { useWebSocket, WsProvider } from "@/lib/ws/context";

function ChatbotGuildSync({ guildId }: { guildId: string }) {
  const { setGuildId } = useChatbot();

  useEffect(() => {
    setGuildId(guildId);
  }, [guildId, setGuildId]);

  return null;
}

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
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        dedupingInterval: 10_000,
        shouldRetryOnError: (err) =>
          (err as { statusCode?: number })?.statusCode !== 404,
      }}
    >
      <WsProvider>
        <MediaPlayerProvider>
          <ChatbotProvider>
            <ChatbotGuildSync guildId={guildId} />
            <ChatbotExpressionSync />
            <div className="min-h-screen bg-canvas">
              <TopNav />
              <HiddenSidebar
                guildId={guildId}
                onGuildChange={(g) => setGuildId(g ?? "")}
              />

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
    </SWRConfig>
  );
}
