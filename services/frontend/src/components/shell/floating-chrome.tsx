"use client";

/**
 * FloatingChrome — the only persistent UI over the constellation.
 * No top bar, no nav rail: brand + live link (top-left), theme toggle
 * and palette hint (top-right), route switcher (bottom-center).
 * All internal navigation uses plain <a href> — trailingSlash builds.
 */
import { Menu, Moon, Sun, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { navItems } from "@/lib/navigation";
import { ConnectionStatus } from "./status-dot";

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return <span className="inline-block size-8" aria-hidden="true" />;
  }
  return (
    <button
      type="button"
      aria-label="Toggle theme"
      className="inline-flex size-8 items-center justify-center rounded-full border border-[var(--color-hairline)] text-[var(--color-ink-soft)] backdrop-blur-sm transition-colors hover:border-[var(--color-signal)] hover:text-[var(--color-signal)]"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
    >
      {theme === "light" ? (
        <Moon className="size-4" aria-hidden="true" />
      ) : (
        <Sun className="size-4" aria-hidden="true" />
      )}
    </button>
  );
}

export function FloatingChrome() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {/* Brand + live link */}
      <div className="pointer-events-auto absolute left-5 top-5 z-20 flex items-center gap-3">
        <span className="font-display text-lg font-semibold tracking-tight text-[var(--color-ink)]">
          GMW
        </span>
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-faint)] sm:inline">
          constellation
        </span>
        <ConnectionStatus compact />
      </div>

      {/* Theme + palette hint */}
      <div className="pointer-events-auto absolute right-5 top-5 z-20 flex items-center gap-2">
        <button
          type="button"
          className="hidden rounded-full border border-[var(--color-hairline)] px-3 py-1 font-mono text-xs text-[var(--color-ink-faint)] backdrop-blur-sm transition-colors hover:text-[var(--color-ink)] md:block"
          onClick={() =>
            window.dispatchEvent(new Event("command-palette:open"))
          }
        >
          ⌘K
        </button>
        <ThemeToggle />
      </div>

      {/* Route switcher */}
      <nav
        aria-label="Routes"
        className="pointer-events-none absolute inset-x-0 bottom-5 z-20 hidden justify-center gap-1 px-4 md:flex"
      >
        <div className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-[var(--color-hairline)] bg-[var(--color-canvas)]/55 px-2 py-1.5 backdrop-blur-md">
          {navItems.map((item) => {
            const active =
              pathname === item.matchPrefix ||
              pathname.startsWith(item.matchPrefix);
            return (
              <a
                key={item.href}
                href={item.href}
                data-active={active || undefined}
                className={`rounded-full px-3 py-1 font-mono text-xs whitespace-nowrap transition-colors ${
                  active
                    ? "bg-[var(--color-signal-glow)] text-[var(--color-ink)]"
                    : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </div>
      </nav>

      {/* Mobile: sheet menu instead of a bottom tab bar */}
      <button
        type="button"
        aria-label={menuOpen ? "Close menu" : "Open menu"}
        aria-expanded={menuOpen}
        className="pointer-events-auto absolute bottom-5 right-5 z-30 inline-flex size-10 items-center justify-center rounded-full border border-[var(--color-hairline)] bg-[var(--color-canvas)]/70 text-[var(--color-ink)] backdrop-blur-md md:hidden"
        onClick={() => setMenuOpen((o) => !o)}
      >
        {menuOpen ? (
          <X className="size-5" aria-hidden="true" />
        ) : (
          <Menu className="size-5" aria-hidden="true" />
        )}
      </button>
      {menuOpen ? (
        <nav
          aria-label="Routes mobile"
          className="pointer-events-auto absolute inset-x-4 bottom-20 z-20 flex flex-col gap-1 rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-canvas-2)]/90 p-2 backdrop-blur-xl md:hidden"
        >
          {navItems.map((item) => {
            const active =
              pathname === item.matchPrefix ||
              pathname.startsWith(item.matchPrefix);
            return (
              <a
                key={item.href}
                href={item.href}
                className={`rounded-xl px-4 py-3 font-mono text-sm ${
                  active
                    ? "bg-[var(--color-signal-glow)] text-[var(--color-ink)]"
                    : "text-[var(--color-ink-soft)]"
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </nav>
      ) : null}
    </>
  );
}
