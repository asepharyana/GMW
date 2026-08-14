"use client";

import { useEffect, useState } from "react";
import { useChatbot } from "@/components/chatbot/chatbot-context";
import { GuildSelector } from "@/components/shared/guild-selector";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/lib/ws/context";
import { PageTitle } from "./spine";
import { ThemeToggle } from "./theme-toggle";

const statusTone: Record<string, string> = {
  connected: "bg-[var(--color-signal)]",
  connecting: "bg-[var(--color-amber)]",
  disconnected: "bg-[var(--color-ink-soft)]",
  error: "bg-[var(--color-vermilion)]",
};

export function StatusBar({
  guildId,
  onGuildChange,
}: {
  guildId: string;
  onGuildChange: (g: string) => void;
}) {
  const ws = useWebSocket();
  const { expression } = useChatbot();
  const [clock, setClock] = useState("--:--:--");

  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString("en-GB", { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-[var(--color-hairline)] bg-[var(--color-canvas)]/85 px-4 backdrop-blur-md md:px-6">
      <PageTitle />
      <div className="ms-auto flex items-center gap-3">
        <span className="hidden items-center gap-1.5 text-xs text-[var(--color-ink-soft)] sm:flex">
          <span className={cn("size-2 rounded-full", statusTone[ws.status])} />
          <span className="mono uppercase">{ws.status}</span>
        </span>
        <span className="hidden text-xs text-[var(--color-ink-soft)] md:inline">
          <span
            className={cn(
              "font-mono",
              expression !== "idle" && "text-[var(--color-signal)]",
            )}
          >
            {expression}
          </span>
        </span>
        <span className="hidden font-mono text-xs text-[var(--color-ink-soft)] lg:inline">
          {clock}
        </span>
        <GuildSelector
          value={guildId}
          onChange={(g) => onGuildChange(g ?? "")}
        />
        <ThemeToggle />
      </div>
    </header>
  );
}
