"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActivePath, mobileNavItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Mobile bottom tab bar. Shown only < md (the side NavRail is hidden there).
 * Mirrors the desktop nav items but as a thumb-friendly dock with labels and a
 * top active indicator. Safe-area aware for notched devices.
 */
export function MobileNav() {
  const path = usePathname() ?? "/";

  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around rounded-t-[20px] px-2 pb-[calc(0.4rem+env(safe-area-inset-bottom))] pt-2 md:hidden">
      {mobileNavItems.map((item) => {
        const active = isActivePath(path, item.matchPrefix);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center rounded-[12px] rounded-t-[20px] px-2 pb-[calc(0.4rem+env(safe-area-inset-bottom))] pt-2 md:hidden",
              active
                ? "bg-signal/15 text-signal"
                : "text-ink-faint hover:bg-white/5 hover:text-ink-soft",
            )}
          >
            {active && (
              <span className="absolute -top-2 h-8 w-8 rounded-full bg-signal shadow-[0_0_12px_var(--color-signal-glow)]" />
            )}
            <item.icon className="size-[20px]" strokeWidth={active ? 2.4 : 2} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
