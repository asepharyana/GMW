"use client";

import { usePathname, useRouter } from "next/navigation";

import { isActivePath, navItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/lib/ws/context";

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useWebSocket();

  const connectionDot = {
    connected:
      "bg-emerald-500 shadow-[0_0_8px] shadow-emerald-500/60 animate-pulse",
    connecting: "bg-amber-400 animate-pulse",
    disconnected: "bg-destructive",
    error: "bg-destructive",
  }[status];

  const connectionLabel = {
    connected: "Connected",
    connecting: "Connecting",
    disconnected: "Disconnected",
    error: "Error",
  }[status];

  return (
    <aside className="hidden md:flex md:w-64 flex-col border-r border-border/50 bg-sidebar shrink-0">
      {/* Brand */}
      <div className="flex h-14 items-center gap-3 border-b border-sidebar-border/50 px-4 shrink-0">
        <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-teal-400 text-white text-xs font-bold shadow-lg shadow-cyan-500/20">
          D
        </div>
        <div>
          <div className="text-sm font-bold tracking-tight">
            <span className="text-gradient">Discord Automod</span>
          </div>
          <div className="text-[10px] text-muted-foreground/60 tracking-widest uppercase leading-none">
            Monitor
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon, matchPrefix }) => {
          const active = isActivePath(pathname, matchPrefix);
          return (
            <button
              key={href}
              type="button"
              onClick={() => router.push(href)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-150 text-left group relative",
                active
                  ? "bg-sidebar-accent/80 text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground/90",
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0 transition-all",
                  active && "text-cyan-400",
                )}
              />
              <span className="truncate">{label}</span>
              {active && (
                <div className="ml-auto w-1 h-5 rounded-full bg-gradient-to-b from-cyan-400 to-teal-500 shadow-[0_0_8px] shadow-cyan-400/60" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Connection status */}
      <div className="border-t border-sidebar-border/50 p-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="relative flex size-2 shrink-0">
            <span
              className={cn(
                "absolute inline-flex size-full rounded-full opacity-75",
                connectionDot,
              )}
            />
            <span
              className={cn(
                "relative inline-flex size-2 rounded-full",
                status === "connected" ? "bg-emerald-500" : connectionDot,
              )}
            />
          </span>
          <span className="text-xs text-muted-foreground/70 truncate font-medium tracking-wide">
            {connectionLabel}
          </span>
        </div>
      </div>
    </aside>
  );
}
