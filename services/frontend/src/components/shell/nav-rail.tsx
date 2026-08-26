"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { isActivePath, navItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP);
}

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
      {/* Precision Micro-Indicator */}
      {active && (
        <span className="absolute -left-[5px] h-3.5 w-[2px] rounded-full bg-signal shadow-[0_0_8px_var(--color-signal-glow)]" />
      )}
      {/* Tooltip on hover */}
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

  useGSAP(
    () => {
      if (!railRef.current) return;
      const items = railRef.current.querySelectorAll(".nav-dock-item");
      gsap.fromTo(
        items,
        { opacity: 0, x: -6 },
        {
          opacity: 1,
          x: 0,
          duration: 0.3,
          stagger: 0.025,
          ease: "power2.out",
          clearProps: "transform",
        },
      );
    },
    { scope: railRef },
  );

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
