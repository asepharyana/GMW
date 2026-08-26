"use client";

import {
  ArrowDown,
  ArrowUp,
  CornerDownLeft,
  Moon,
  Search,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import { GlassPanel } from "@/components/primitives";
import { navItems } from "@/lib/navigation";

interface Command {
  id: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  /** Render as a Link when present; otherwise run the action. */
  href?: string;
  run?: () => void;
}

export function CommandPalette() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = navItems.map((n) => ({
      id: `nav:${n.href}`,
      label: `Go to ${n.label}`,
      hint: n.href,
      icon: <n.icon className="size-4 text-signal" />,
      href: n.href,
    }));
    const actions: Command[] = [
      {
        id: "act:theme",
        label: "Toggle theme",
        hint: "appearance",
        icon:
          theme === "light" ? (
            <Moon className="size-4 text-signal" />
          ) : (
            <Sun className="size-4 text-signal" />
          ),
        run: () => setTheme(theme === "light" ? "dark" : "light"),
      },
    ];
    return [...nav, ...actions];
  }, [theme, setTheme]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("command-palette:open", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("command-palette:open", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, []);

  if (!open) return null;

  const runAt = (i: number) => {
    const c = filtered[i];
    if (!c) return;
    if (c.run) {
      setOpen(false);
      c.run();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-black/50 px-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={() => setOpen(false)}
      role="presentation"
    >
      <GlassPanel
        className="w-full max-w-[560px] overflow-hidden p-0"
        style={{ animation: "fade-up 0.14s ease" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
          <Search className="size-4 text-ink-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const c = filtered[active];
                if (c?.href) {
                  setOpen(false);
                } else {
                  runAt(active);
                }
              }
            }}
            placeholder="Type a command or search…"
            className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
          />
          <kbd className="mono rounded bg-surface-2 px-1.5 py-0.5 text-[0.6rem] text-ink-faint">
            ESC
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-ink-faint">
              No commands
            </div>
          ) : (
            filtered.map((c, i) => {
              const row = (
                <span
                  key={c.id}
                  className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-sm transition-colors ${
                    i === active
                      ? "bg-signal/15 text-ink"
                      : "text-ink-soft hover:bg-surface"
                  }`}
                >
                  <span className="flex size-7 items-center justify-center rounded-[8px] bg-surface-2">
                    {c.icon}
                  </span>
                  <span className="flex-1">{c.label}</span>
                  <span className="mono text-[0.65rem] text-ink-faint">
                    {c.hint}
                  </span>
                  {i === active && (
                    <CornerDownLeft className="size-3.5 text-ink-faint" />
                  )}
                </span>
              );
              return c.href ? (
                <a
                  key={c.id}
                  href={c.href}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => setOpen(false)}
                  className="block"
                >
                  {row}
                </a>
              ) : (
                <button
                  key={c.id}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => runAt(i)}
                  className="block w-full"
                >
                  {row}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-hairline px-4 py-2 text-[0.65rem] text-ink-faint">
          <span className="flex items-center gap-1">
            <ArrowUp className="size-3" />
            <ArrowDown className="size-3" /> navigate
          </span>
          <span className="flex items-center gap-1">
            <CornerDownLeft className="size-3" /> select
          </span>
          <span className="ml-auto mono">⌘K</span>
        </div>
      </GlassPanel>
    </div>
  );
}
