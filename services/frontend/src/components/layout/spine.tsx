"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const titleFromPath: Record<string, string> = {
  "/dashboard": "Overview",
  "/messages": "Messages",
  "/voice": "Voice",
  "/media": "Media",
  "/recordings": "Recordings",
  "/moderation": "Moderation",
  "/analysis": "Analysis",
};

export function Spine() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop rail */}
      <nav className="fixed left-0 top-0 z-30 hidden h-svh w-[68px] flex-col items-center gap-1 border-r border-[var(--color-hairline)] bg-[var(--color-canvas)]/80 py-4 backdrop-blur-md md:flex">
        <Link
          href="/dashboard"
          className="mb-3 flex size-9 items-center justify-center rounded-[var(--radius-r-control)] bg-[var(--color-signal)] text-sm font-black text-[var(--color-signal-ink)]"
          aria-label="Bete"
        >
          B
        </Link>
        {navItems.map((item) => {
          const active = pathname.startsWith(item.matchPrefix);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex size-11 items-center justify-center rounded-[var(--radius-r)] transition-colors",
                active
                  ? "text-[var(--color-signal)]"
                  : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]",
              )}
              aria-current={active ? "page" : undefined}
            >
              {active && (
                <motion.span
                  layoutId="spine-active"
                  className="absolute left-0 top-1/2 size-1 -translate-y-1/2 rounded-full bg-[var(--color-signal)]"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <Icon className="size-5" />
              <span className="pointer-events-none absolute left-full ml-2 hidden whitespace-nowrap rounded-[var(--radius-r-control)] bg-[var(--color-ink)] px-2 py-1 text-xs font-medium text-[var(--color-canvas)] opacity-0 transition-opacity group-hover:opacity-100 md:block">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Mobile bottom tab-bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch border-t border-[var(--color-hairline)] bg-[var(--color-canvas)]/90 backdrop-blur-md md:hidden">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.matchPrefix);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                active
                  ? "text-[var(--color-signal)]"
                  : "text-[var(--color-ink-soft)]",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="size-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export function PageTitle() {
  const pathname = usePathname();
  const key =
    Object.keys(titleFromPath).find((k) => pathname.startsWith(k)) ??
    "/dashboard";
  return (
    <span className="font-semibold max-md:hidden">{titleFromPath[key]}</span>
  );
}
