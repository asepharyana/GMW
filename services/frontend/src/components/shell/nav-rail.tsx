"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { isActivePath, navItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

function NavItem({
  href,
  label,
  active,
  Icon,
}: {
  href: string;
  label: string;
  active: boolean;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}) {
  return (
    <a
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "nav-dock-item group relative flex size-9 items-center justify-center rounded-[8px] transition-all duration-150",
        active
          ? "is-active bg-signal/15 text-signal font-semibold shadow-xs border border-signal/30"
          : "text-ink-muted hover:bg-surface-2 hover:text-ink",
      )}
    >
      <Icon className="relative z-10 size-4" strokeWidth={active ? 2.2 : 1.8} />
      {active && (
        <span className="absolute -left-[5px] h-3.5 w-[2px] rounded-full bg-signal shadow-[0_0_8px_var(--color-signal-glow)]" />
      )}
      <span className="pointer-events-none absolute left-full z-50 ml-2.5 hidden whitespace-nowrap rounded-md border border-hairline bg-surface px-2 py-0.5 font-sans text-[11px] font-medium tracking-tight text-ink opacity-0 shadow-lg backdrop-blur-md transition-all group-hover:translate-x-0.5 group-hover:opacity-100 md:block">
        {label}
      </span>
    </a>
  );
}

export function NavRail() {
  const pathname = usePathname();
  const path = pathname ?? "/";
  const railRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const items = rail.querySelectorAll<HTMLElement>(".nav-dock-item");
    if (items.length === 0) return;

    items.forEach((el, i) => {
      el.style.opacity = "0";
      el.style.animationFillMode = "forwards";
      el.style.animationTimingFunction = "ease-out";
      el.style.animationName = "stagger-slide-in";
      el.style.animationDuration = "0.3s";
      el.style.animationDelay = `${i * 0.025}s`;
    });

    return () => {
      items.forEach((el) => {
        el.style.removeProperty("opacity");
        el.style.removeProperty("animation-name");
        el.style.removeProperty("animation-duration");
        el.style.removeProperty("animation-delay");
        el.style.removeProperty("animation-fill-mode");
        el.style.removeProperty("animation-timing-function");
      });
    };
  }, []);

  return (
    <nav
      ref={railRef}
      className="glass mb-[calc(0.75rem+env(safe-area-inset-bottom))] ml-[calc(0.75rem+env(safe-area-inset-left))] mt-[calc(0.75rem+env(safe-area-inset-top))] hidden w-[54px] flex-col items-center gap-1 py-3 md:flex"
    >
      <div className="flex flex-1 flex-col gap-1">
        {navItems.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            label={item.label}
            active={isActivePath(path, item.matchPrefix)}
            Icon={item.icon}
          />
        ))}
      </div>
    </nav>
  );
}
