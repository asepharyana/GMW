"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActivePath, mobileNavItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-10 border-t border-border/50 bg-background/80 backdrop-blur-lg">
      <div className="flex">
        {mobileNavItems.map(({ href, label, icon: Icon, matchPrefix }) => {
          const active = isActivePath(pathname, matchPrefix);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 py-2 text-[11px] font-medium transition-all relative",
                active ? "text-cyan-400" : "text-muted-foreground/60",
              )}
            >
              <Icon className="size-5" />
              <span>{label}</span>
              {active && (
                <span className="absolute -top-px left-1/2 -translate-x-1/2 size-1 rounded-full bg-cyan-400 shadow-[0_0_6px] shadow-cyan-400/80" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
