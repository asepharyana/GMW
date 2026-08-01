"use client";

import { Moon, Sun } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isActivePath, navItems } from "@/lib/navigation";

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const stored = localStorage.getItem("theme") as "light" | "dark" | null;
    if (stored) setTheme(stored);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(next);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-11 flex items-center gap-1 px-3 glass-intense border-b border-[var(--color-border-glow)]">
      {/* Brand */}
      <div className="flex items-center gap-2 mr-4 shrink-0">
        <div className="relative flex size-6 items-center justify-center rounded-md bg-gradient-to-br from-cyan-500 to-teal-400 text-white text-[10px] font-bold">
          D
          <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/80 animate-pulse" />
        </div>
        <span className="text-xs font-semibold text-text-primary tracking-tight hidden sm:inline">
          Discord Automod
        </span>
      </div>

      {/* Nav links */}
      <nav className="flex items-center gap-0.5 flex-1 justify-center">
        {navItems.map(({ href, label, icon: Icon, matchPrefix }) => {
          const active = isActivePath(pathname, matchPrefix);
          return (
            <button
              key={href}
              type="button"
              onClick={() => router.push(href)}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 ${
                active
                  ? "text-text-primary"
                  : "text-text-secondary/60 hover:text-text-primary/80"
              }`}
            >
              <Icon className="size-3.5" />
              <span className="hidden sm:inline">{label}</span>
              {active && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-primary shadow-[0_0_8px] shadow-primary/60" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Right side */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={toggleTheme}
          className="size-7 flex items-center justify-center rounded-md text-text-secondary/60 hover:text-text-primary hover:bg-glass-bg transition-all"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? (
            <Moon className="size-3.5" />
          ) : (
            <Sun className="size-3.5" />
          )}
        </button>
      </div>
    </header>
  );
}
