"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { SWRConfig } from "swr";
import { ChatbotContainer } from "@/components/chatbot/chatbot-container";
import {
  ChatbotProvider,
  useChatbot,
} from "@/components/chatbot/chatbot-context";
import { DashLeftRail } from "@/components/layout/dash-left-rail";
import { DashTopBar } from "@/components/layout/dash-top-bar";
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
 * New Event Horizon shell — used only on /dashboard.
 *
 * No `Spine`, no `StatusBar`, no padded `<main>`, no 1440px max-width.
 * Full-bleed single-screen layout. Other dashboard routes keep the
 * classic shell so the rest of the app is untouched.
 */
function ConsoleShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-svh w-full flex-col overflow-hidden bg-[var(--color-canvas)]">
      <DashTopBar guildName="GMW Console" />
      <div className="flex min-h-0 flex-1">
        <DashLeftRail />
        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
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
              <ConsoleShell>{children}</ConsoleShell>
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
