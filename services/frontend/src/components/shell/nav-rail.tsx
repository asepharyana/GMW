"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems, isActivePath } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import {
  Tooltip,
} from "@/components/primitives/tooltip";

export function NavRail() {
  const pathname = usePathname();
  return (
    <nav className="glass m-3 mr-0 flex w-[68px] flex-col items-center gap-1 rounded-[18px] py-4">
      <Link
        href="/dashboard"
        className="mb-3 flex size-11 items-center justify-center rounded-[14px] bg-signal/15 text-signal glow-signal"
        aria-label="GMW home"
      >
        <span className="display text-xl">G</span>
      </Link>
      <div className="flex flex-1 flex-col gap-1">
        {navItems.map((item) => {
          const active = isActivePath(pathname, item.matchPrefix);
          const Icon = item.icon;
          return (
            <Tooltip key={item.href} label={item.label} side="bottom">
              <Link
                href={item.href}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex size-11 items-center justify-center rounded-[13px] transition-all",
                  active
                    ? "bg-signal/15 text-signal"
                    : "text-ink-faint hover:bg-white/5 hover:text-ink-soft",
                )}
              >
                {active && (
                  <span className="absolute -left-3 h-6 w-1 rounded-full bg-signal shadow-[0_0_12px_var(--color-signal-glow)]" />
                )}
                <Icon className="size-[18px]" strokeWidth={active ? 2.4 : 2} />
              </Link>
            </Tooltip>
          );
        })}
      </div>
    </nav>
  );
}
