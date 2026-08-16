"use client";

import { Moon, Sun } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
import { navItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { ConnectionStatus } from "./status-dot";

function useActiveLabel() {
  const pathname = usePathname();
  const item = [...navItems]
    .sort((a, b) => b.matchPrefix.length - a.matchPrefix.length)
    .find((i) => pathname.startsWith(i.matchPrefix));
  return item?.label ?? "Console";
}

export function TopBar() {
  const label = useActiveLabel();
  const { state } = useAmbient();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const signalTone =
    state.tone === "vermilion"
      ? "text-vermilion"
      : state.tone === "amber"
        ? "text-amber"
        : "text-signal";

  return (
    <header className="sticky top-0 z-40 flex items-center gap-3 px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:gap-4 sm:px-5 sm:py-3.5">
      <div className="flex min-w-0 items-baseline gap-2 sm:gap-3">
        <span className="eyebrow hidden sm:inline">GMW</span>
        <h1 className="display truncate text-[1.25rem] text-ink sm:text-[1.5rem]">{label}</h1>
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <span className={cn("pill hidden sm:flex", signalTone)}>
          <span
            className={cn("size-1.5 rounded-full bg-current animate-breathe")}
          />
          {state.label ?? "nominal"}
        </span>
        <ConnectionStatus compact />
        <button
          type="button"
          aria-label="Open command palette"
          onClick={() =>
            window.dispatchEvent(new Event("command-palette:open"))
          }
          className="hidden items-center gap-1.5 rounded-[11px] border border-hairline bg-white/5 px-2.5 py-1.5 text-xs text-ink-soft transition-colors hover:text-ink hover:border-signal/40 sm:flex"
        >
          <span className="mono text-[0.65rem]">⌘K</span>
        </button>
        <button
          type="button"
          aria-label="Toggle theme"
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          className="flex size-9 items-center justify-center rounded-[11px] border border-hairline bg-white/5 text-ink-soft transition-colors hover:text-ink hover:border-signal/40"
        >
          {mounted && theme === "light" ? (
            <Moon className="size-4" />
          ) : (
            <Sun className="size-4" />
          )}
        </button>
      </div>
    </header>
  );
}
