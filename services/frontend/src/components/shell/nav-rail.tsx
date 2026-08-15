"use client";

import { LayoutDashboard } from "lucide-react";
import { usePathname } from "next/navigation";
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
    </a>
  );
}

export function NavRail() {
  const pathname = usePathname();
  const path = pathname ?? "/";

  return (
    <nav className="glass m-3 mr-0 flex w-[68px] flex-col items-center gap-1 rounded-[18px] py-4">
      <NavItem
        href="/dashboard"
        label="Dashboard"
        active={isActivePath(path, "/dashboard")}
        Icon={LayoutDashboard}
      />
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
