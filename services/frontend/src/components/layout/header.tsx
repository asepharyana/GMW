"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/lib/ws/context";

export function Header() {
  const { status } = useWebSocket();
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const stored = localStorage.getItem("theme") as "light" | "dark" | null;
    if (stored) setTheme(stored);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(next);
  };

  const statusVariant =
    status === "connected"
      ? "default"
      : status === "connecting"
        ? "secondary"
        : "destructive";

  const statusLabel =
    status === "connected"
      ? "Connected"
      : status === "connecting"
        ? "Connecting"
        : status === "error"
          ? "Error"
          : "Disconnected";

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border/50 bg-background/60 backdrop-blur-lg px-4 md:px-6">
      <SidebarTrigger className="-ml-1 size-8 text-muted-foreground hover:text-foreground" />

      <div className="flex-1" />

      {/* Connection status */}
      <Tooltip>
        <TooltipTrigger>
          <span>
            <Badge
              variant={statusVariant}
              className="gap-1.5 px-2.5 py-1 cursor-default select-none"
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  status === "connected" &&
                    "bg-green-500 shadow-[0_0_6px] shadow-green-500/60",
                  status === "connecting" && "bg-yellow-500 animate-pulse",
                  (status === "disconnected" || status === "error") &&
                    "bg-destructive",
                )}
              />
              <span className="hidden sm:inline text-xs">{statusLabel}</span>
            </Badge>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>WebSocket: {statusLabel}</p>
        </TooltipContent>
      </Tooltip>

      {/* Theme toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        aria-label="Toggle theme"
        className="size-8"
      >
        <div className="relative size-4">
          <Sun
            className={cn(
              "absolute inset-0 size-4 transition-all duration-300",
              theme === "dark"
                ? "opacity-0 rotate-90 scale-75"
                : "opacity-100 rotate-0 scale-100",
            )}
          />
          <Moon
            className={cn(
              "absolute inset-0 size-4 transition-all duration-300",
              theme === "dark"
                ? "opacity-100 rotate-0 scale-100"
                : "opacity-0 -rotate-90 scale-75",
            )}
          />
        </div>
      </Button>
    </header>
  );
}
