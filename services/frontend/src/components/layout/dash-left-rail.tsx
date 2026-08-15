"use client";

/**
 * DashLeftRail — 80px vertical monogram nav.
 *
 * Each item is a glyph + label. Active state uses an accent bar on the left
 * and full ink colour. No backgrounds, no boxes.
 */

import {
  Activity,
  BarChart3,
  Flag,
  MessagesSquare,
  Mic,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  glyph: React.ReactNode;
  label: string;
}

const ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    glyph: <BarChart3 className="size-4" />,
    label: "Console",
  },
  {
    href: "/messages",
    glyph: <MessagesSquare className="size-4" />,
    label: "Messages",
  },
  {
    href: "/moderation",
    glyph: <ShieldCheck className="size-4" />,
    label: "Moderation",
  },
  { href: "/voice", glyph: <Mic className="size-4" />, label: "Voice" },
  { href: "/media", glyph: <Activity className="size-4" />, label: "Media" },
  {
    href: "/recordings",
    glyph: <Flag className="size-4" />,
    label: "Recordings",
  },
  { href: "/analysis", glyph: <Users className="size-4" />, label: "Analysis" },
];

export function DashLeftRail() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Console navigation"
      className="flex h-full w-20 shrink-0 flex-col items-center gap-1 border-r border-[var(--color-hairline)] bg-[var(--color-surface)] py-3"
    >
      {ITEMS.map((it) => {
        const active =
          pathname === it.href || pathname?.startsWith(`${it.href}/`);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              "group relative flex w-full flex-col items-center gap-1 py-2 text-[10px] uppercase tracking-wide transition-colors",
              active
                ? "text-[var(--color-ink)]"
                : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]",
            )}
            data-active={active ? "1" : "0"}
          >
            <span
              aria-hidden
              className={cn(
                "absolute inset-y-2 left-0 w-[2px] origin-center transition-transform",
                active ? "scale-y-100" : "scale-y-0 group-hover:scale-y-100",
              )}
              style={{ background: "var(--color-signal)" }}
            />
            {it.glyph}
            <span className="font-mono">{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
