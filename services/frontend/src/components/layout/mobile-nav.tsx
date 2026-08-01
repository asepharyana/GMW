"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActivePath, mobileNavItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 glass-intense border-t border-glass-border">
      <div className="flex items-center justify-around h-14 px-2">
        {mobileNavItems.map(({ href, label, icon: Icon, matchPrefix }) => {
          const active = isActivePath(pathname, matchPrefix);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg transition-all relative min-w-0",
                active
                  ? "text-primary"
                  : "text-text-secondary/50 hover:text-text-secondary/80",
              )}
            >
              <Icon className="size-5" />
              <span className="text-[10px] font-medium leading-tight">
                {label}
              </span>
              {active && (
                <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 size-1 rounded-full bg-primary shadow-[0_0_6px] shadow-primary/80" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
