"use client";

import { Suspense, useEffect, useState } from "react";
import { SWRConfig } from "swr";
import { ChatbotContainer } from "@/components/chatbot/chatbot-container";
import {
  ChatbotProvider,
  useChatbot,
} from "@/components/chatbot/chatbot-context";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MiniPlayer } from "@/components/media/mini-player";
import { GuildSelector } from "@/components/shared/guild-selector";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
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
            <div className="min-h-svh bg-canvas">
              <SidebarProvider>
                <AppSidebar />
                <SidebarInset className="gap-0">
                  <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 bg-canvas">
                    <SidebarTrigger className="-ml-1" />
                    <Separator
                      orientation="vertical"
                      className="mr-2 h-6 max-md:hidden"
                    />
                    <div className="font-semibold max-md:hidden">Overview</div>
                    <div className="ms-auto">
                      <GuildSelector
                        value={guildId}
                        onChange={(g) => setGuildId(g ?? "")}
                      />
                    </div>
                  </header>

                  <main className="flex flex-1 flex-col gap-4 p-4 pb-28 md:p-6 lg:pb-8">
                    <div className="mx-auto w-full max-w-[1440px]">
                      <Suspense
                        fallback={
                          <div className="flex h-[60vh] items-center justify-center">
                            <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                          </div>
                        }
                      >
                        {children}
                      </Suspense>
                    </div>
                  </main>
                </SidebarInset>
              </SidebarProvider>

              <MiniPlayer />
              <ChatbotContainer />
            </div>
          </ChatbotProvider>
        </MediaPlayerProvider>
      </WsProvider>
    </SWRConfig>
  );
}
