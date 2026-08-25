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
      className={cn(
        "nav-dock-item group relative flex size-9 items-center justify-center rounded-[7px] transition-all duration-150",
        active
          ? "is-active bg-white/[0.08] text-[#f7f8f8] shadow-sm border border-white/[0.12]"
          : "text-[#8a8f98] hover:bg-white/[0.04] hover:text-[#d0d6e0]",
      )}
    >
      <Icon
        className="relative z-10 size-4"
        strokeWidth={active ? 2.2 : 1.8}
      />
      {/* Precision Micro-Indicator */}
      {active && (
        <span className="absolute -left-[5px] h-3.5 w-[2px] rounded-full bg-[#7170ff]" />
      )}
      {/* Tooltip on hover */}
      <span className="pointer-events-none absolute left-full z-50 ml-2.5 hidden whitespace-nowrap rounded-[5px] border border-white/[0.08] bg-[#0f1011] px-2 py-0.5 font-sans text-[11px] font-medium tracking-tight text-[#f7f8f8] opacity-0 shadow-lg backdrop-blur-md transition-all group-hover:translate-x-0.5 group-hover:opacity-100 md:block">
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
      className="mb-[calc(0.75rem+env(safe-area-inset-bottom))] ml-[calc(0.75rem+env(safe-area-inset-left))] mt-[calc(0.75rem+env(safe-area-inset-top))] hidden w-[54px] flex-col items-center gap-1 rounded-[10px] border border-white/[0.08] bg-[#0f1011]/80 py-3 shadow-xl backdrop-blur-md md:flex"
    >
      <div className="flex flex-1 flex-col gap-1">
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
