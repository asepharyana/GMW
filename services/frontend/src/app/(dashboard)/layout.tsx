"use client";

import { Suspense, useEffect, useState } from "react";
import { SWRConfig } from "swr";
import { ChatbotContainer } from "@/components/chatbot/chatbot-container";
import {
  ChatbotProvider,
  useChatbot,
} from "@/components/chatbot/chatbot-context";
import { Spine } from "@/components/layout/spine";
import { StatusBar } from "@/components/layout/status-bar";
import { MiniPlayer } from "@/components/media/mini-player";
import { RouteTransition } from "@/components/motion/route-transition";
import { GuildSelector } from "@/components/shared/guild-selector";
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
    const unsub2 = ws.on("voice_active_user", () => setExpression("listening"));
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
            <div className="min-h-svh bg-[var(--color-canvas)] md:pl-[68px]">
              <Spine />
              <div className="flex min-h-svh flex-col">
                <StatusBar
                  guildId={guildId}
                  onGuildChange={(g) => setGuildId(g)}
                />
                <main className="flex flex-1 flex-col gap-4 p-4 pb-24 md:p-6 lg:pb-8">
                  <div className="mx-auto w-full max-w-[1440px]">
                    <Suspense
                      fallback={
                        <div className="flex h-[60vh] items-center justify-center">
                          <div className="size-8 animate-spin rounded-full border-2 border-[var(--color-signal)] border-t-transparent" />
                        </div>
                      }
                    >
                      <RouteTransition>{children}</RouteTransition>
                    </Suspense>
                  </div>
                </main>
              </div>
              <MiniPlayer />
              <ChatbotContainer />
            </div>
          </ChatbotProvider>
        </MediaPlayerProvider>
      </WsProvider>
    </SWRConfig>
  );
}
