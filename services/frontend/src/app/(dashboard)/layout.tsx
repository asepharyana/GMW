"use client";

import { usePathname } from "next/navigation";
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

/**
 * Ambient shell — used only on /dashboard.
 *
 * No TopBar, no LeftRail, no main padding. The view itself is full-bleed
 * (AmbientField + floating overlays). This is the ground-up rombak — not a
 * re-skin of the classic dashboard template.
 */
function AmbientShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[calc(100svh-3rem)] w-full overflow-hidden">
      {children}
    </div>
  );
}

/**
 * Classic shell — used on every other route under /(dashboard).
 */
function ClassicShell({
  children,
  guildId,
  setGuildId,
}: {
  children: React.ReactNode;
  guildId: string;
  setGuildId: (g: string) => void;
}) {
  return (
    <div className="min-h-svh bg-[var(--color-canvas)] md:pl-[68px]">
      <Spine />
      <div className="flex min-h-svh flex-col">
        <StatusBar guildId={guildId} onGuildChange={(g) => setGuildId(g)} />
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
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [guildId, setGuildId] = useState("");
  const pathname = usePathname();
  // Match exact /dashboard or /dashboard/ but not /dashboard/<subroute>
  const isConsole = pathname === "/dashboard" || pathname === "/dashboard/";

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
            {isConsole ? (
              <AmbientShell>{children}</AmbientShell>
            ) : (
              <ClassicShell guildId={guildId} setGuildId={setGuildId}>
                {children}
              </ClassicShell>
            )}
            <MiniPlayer />
            <ChatbotContainer />
          </ChatbotProvider>
        </MediaPlayerProvider>
      </WsProvider>
    </SWRConfig>
  );
}
