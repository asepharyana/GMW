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
  index,
}: {
  href: string;
  label: string;
  active: boolean;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  index: number;
}) {
  return (
    <a
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      style={{ "--i": index } as React.CSSProperties}
      className={cn(
        "nav-dock-item game-nav-item group relative flex size-11 items-center justify-center rounded-[13px] transition-all duration-200",
        active
          ? "is-active bg-white/10 text-white shadow-sm ring-1 ring-white/20"
          : "text-ink-faint hover:bg-white/5 hover:text-ink-soft hover:scale-105",
      )}
    >
      {active && <span className="game-marker -left-3.5" />}
      <span className="game-sweep" aria-hidden="true">
        <i />
      </span>
      <Icon
        className="relative z-10 size-[18px]"
        strokeWidth={active ? 2.4 : 2}
      />
      {/* HUD Tooltip on hover */}
      <span className="pointer-events-none absolute left-full z-50 ml-3 hidden whitespace-nowrap rounded-md border border-hairline bg-canvas-2/95 px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wider text-ink opacity-0 shadow-xl backdrop-blur-md transition-all group-hover:translate-x-1 group-hover:opacity-100 md:block">
        <span className="text-signal mr-1.5">›</span>
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
        { opacity: 0, x: -8, scale: 0.9 },
        {
          opacity: 1,
          x: 0,
          scale: 1,
          duration: 0.4,
          stagger: 0.04,
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
      className="glass mb-[calc(0.75rem+env(safe-area-inset-bottom))] ml-[calc(0.75rem+env(safe-area-inset-left))] mt-[calc(0.75rem+env(safe-area-inset-top))] hidden w-[68px] flex-col items-center gap-1 rounded-[18px] border border-hairline/80 py-4 shadow-2xl backdrop-blur-xl md:flex"
    >
      <div className="flex flex-1 flex-col gap-1.5">
        {navItems.map((item, i) => (
          <NavItem
            key={item.href}
            href={item.href}
            label={item.label}
            index={i}
            active={isActivePath(path, item.matchPrefix)}
            Icon={item.icon}
          />
        ))}
      </div>
    </nav>
  );
}
