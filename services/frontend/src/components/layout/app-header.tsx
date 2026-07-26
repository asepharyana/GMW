"use client";

import { Moon, PanelLeft, Sun } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { navItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/lib/ws/context";

export function AppHeader() {
  const pathname = usePathname();
  const { status } = useWebSocket();
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [mobileOpen, setMobileOpen] = useState(false);

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

  const pageTitle =
    navItems
      .filter((n) =>
        n.matchPrefix === "/dashboard"
          ? pathname === "/dashboard"
          : pathname.startsWith(n.matchPrefix),
      )
      .map((n) => n.label)
      .at(0) ?? "Dashboard";

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
        : "Disconnected";

  return (
    <>
      <header className="flex h-14 items-center gap-3 border-b border-border/50 bg-background/60 backdrop-blur-lg px-4 shrink-0">
        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden size-8 -ml-1 text-muted-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          <PanelLeft className="size-4" />
        </Button>

        <h1 className="text-sm font-semibold">{pageTitle}</h1>

        <div className="flex-1" />

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
              status === "disconnected" && "bg-destructive",
              status === "error" && "bg-destructive",
            )}
          />
          <span className="hidden sm:inline text-xs">{statusLabel}</span>
        </Badge>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="size-8"
        >
          <Sun
            className={cn(
              "size-4 transition-all absolute",
              theme === "dark"
                ? "opacity-0 rotate-90 scale-75"
                : "opacity-100 rotate-0 scale-100",
            )}
          />
          <Moon
            className={cn(
              "size-4 transition-all absolute",
              theme === "dark"
                ? "opacity-100 rotate-0 scale-100"
                : "opacity-0 -rotate-90 scale-75",
            )}
          />
        </Button>
      </header>

      {/* Mobile overlay menu */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* biome-ignore lint/a11y/noStaticElementInteractions: overlay backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            role="button"
            tabIndex={0}
            onClick={() => setMobileOpen(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setMobileOpen(false);
            }}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-60 bg-sidebar border-r border-sidebar-border p-2 space-y-0.5">
            {navItems.map(({ href, label, icon: Icon, matchPrefix }) => {
              const active = isActivePath(pathname, matchPrefix);
              return (
                <button
                  key={href}
                  type="button"
                  onClick={() => {
                    window.location.href = href;
                    setMobileOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all text-left",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span>{label}</span>
                </button>
              );
            })}
          </aside>
        </div>
      )}
    </>
  );
}

function isActivePath(pathname: string, prefix: string) {
  if (prefix === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(prefix);
}
