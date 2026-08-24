"use client";

import { usePathname } from "next/navigation";
import { isActivePath, navItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

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
        "game-nav-item group flex size-11 items-center justify-center rounded-[13px] transition-colors",
        active
          ? "is-active bg-white/10 text-white"
          : "text-ink-faint hover:bg-white/5 hover:text-ink-soft",
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
      {/* hover tooltip — labels are hidden in the rail, so surface on hover */}
      <span className="pointer-events-none absolute left-full z-50 ml-3 hidden whitespace-nowrap rounded-[9px] border border-hairline bg-canvas-2 px-2.5 py-1.5 font-mono text-xs font-medium text-ink-soft opacity-0 shadow-lg transition-opacity group-hover:opacity-100 md:block">
        {label}
      </span>
    </a>
  );
}

export function NavRail() {
  const pathname = usePathname();
  const path = pathname ?? "/";

  return (
    <nav className="glass mb-[calc(0.75rem+env(safe-area-inset-bottom))] ml-[calc(0.75rem+env(safe-area-inset-left))] mt-[calc(0.75rem+env(safe-area-inset-top))] hidden w-[68px] flex-col items-center gap-1 rounded-[18px] py-4 md:flex">
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
