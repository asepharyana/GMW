"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { mobileNavItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const pathname = usePathname();

  const isActive = (prefix: string) => {
    if (prefix === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(prefix);
  };

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-10 border-t border-border/50 bg-background/80 backdrop-blur-lg">
      <div className="flex">
        {mobileNavItems.map(({ href, label, icon: Icon, matchPrefix }) => {
          const active = isActive(matchPrefix);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-all relative",
                active ? "text-sky-400" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" />
              <span>{label}</span>
              {active && (
                <span className="absolute -top-px left-1/4 right-1/4 h-0.5 rounded-full bg-gradient-to-r from-sky-400 to-cyan-400" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
