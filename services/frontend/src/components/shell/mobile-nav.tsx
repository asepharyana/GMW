"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { isActivePath, mobileNavItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Mobile bottom tab bar. Shown only < md (the side NavRail is hidden there).
 * Mirrors the FULL desktop sidebar nav (all primary items, same as NavRail) so
 * every page is reachable on mobile. On narrow screens the bar scrolls
 * horizontally (snap) — the active item snaps into view on navigation. Safe-area
 * aware for notched devices.
 *
 * NOTE: uses a plain `<a href>` (NOT Next `<Link>`) — deliberately identical to
 * the working NavRail. Next's client-side router is unreliable here (a hydration
 * mismatch in the SSR-seeded live feeds leaves `router.push` a no-op), so client
 * `<Link>` navigation dead-ends (the "navbar mobile tak bisa pindah halaman"
 * bug). A plain anchor does a full browser navigation and always works.
 */
export function MobileNav() {
  const path = usePathname() ?? "/";
  const stripRef = useRef<HTMLDivElement>(null);

  // Keep the active item visible: snap it into view whenever the route changes.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const item = mobileNavItems.find((n) => isActivePath(path, n.matchPrefix));
    const el = item
      ? strip.querySelector<HTMLElement>(`a[href="${item.href}"]`)
      : null;
    if (el) {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [path]);

  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-40 md:hidden">
      <div
        ref={stripRef}
        className="flex w-full items-stretch overflow-x-auto overscroll-x-contain px-2 pb-[calc(0.4rem+env(safe-area-inset-bottom))] pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:justify-around"
      >
        {mobileNavItems.map((item) => {
          const active = isActivePath(path, item.matchPrefix);
          return (
            <a
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "game-nav-item relative flex min-h-[44px] w-[72px] shrink-0 snap-center flex-col items-center justify-center rounded-t-[20px] px-1 pt-2 pb-[calc(0.4rem+env(safe-area-inset-bottom))] sm:flex-none",
                active
                  ? "is-active text-signal"
                  : "text-ink-faint hover:text-ink-soft",
              )}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-4 top-0 h-[2px] bg-signal shadow-[0_0_8px_var(--color-signal-glow)]"
                />
              )}
              <span className="game-sweep" aria-hidden="true">
                <i />
              </span>
              <item.icon
                className="relative z-10 size-[20px]"
                strokeWidth={active ? 2.4 : 2}
              />
              <span className="relative z-10 mt-0.5 max-w-full truncate text-[10px] leading-tight sm:text-xs">
                {item.label}
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
