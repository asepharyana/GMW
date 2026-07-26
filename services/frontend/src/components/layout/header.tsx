"use client";

import { Moon, Sun, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
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

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-4 md:px-6">
      <div className="flex-1" />

      {/* Connection status */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {status === "connected" ? (
          <>
            <Wifi className="size-3 text-green-500" />
            <span className="hidden sm:inline">Connected</span>
          </>
        ) : status === "connecting" ? (
          <>
            <Wifi className="size-3 text-yellow-500" />
            <span className="hidden sm:inline">Connecting</span>
          </>
        ) : (
          <>
            <WifiOff className="size-3 text-destructive" />
            <span className="hidden sm:inline">Disconnected</span>
          </>
        )}
      </div>

      {/* Theme toggle */}
      <button
        type="button"
        onClick={toggleTheme}
        className="inline-flex size-8 items-center justify-center rounded-lg border hover:bg-muted transition-colors"
        aria-label="Toggle theme"
      >
        {theme === "dark" ? (
          <Sun className="size-4" />
        ) : (
          <Moon className="size-4" />
        )}
      </button>
    </header>
  );
}
