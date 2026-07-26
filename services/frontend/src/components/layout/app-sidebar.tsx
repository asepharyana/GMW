"use client";

import { usePathname, useRouter } from "next/navigation";

import { navItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/lib/ws/context";

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useWebSocket();

  const isActive = (prefix: string) => {
    if (prefix === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(prefix);
  };

  const connectionDot = {
    connected: "bg-green-500",
    connecting: "bg-yellow-500 animate-pulse",
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
    <aside className="hidden md:flex md:w-60 flex-col border-r border-border/50 bg-sidebar shrink-0">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border/50 px-4 shrink-0">
        <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-400 text-white text-xs font-bold">
          D
        </div>
        <div>
          <div className="text-sm font-bold tracking-tight">
            <span className="text-gradient">DC Automod</span>
          </div>
          <div className="text-[10px] text-muted-foreground tracking-widest uppercase leading-none">
            Dashboard
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon, matchPrefix }) => {
          const active = isActive(matchPrefix);
          return (
            <button
              key={href}
              type="button"
              onClick={() => router.push(href)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-150 text-left",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0 transition-all",
                  active && "text-sky-400",
                )}
              />
              <span className="truncate">{label}</span>
              {active && (
                <div className="ml-auto w-0.5 h-4 rounded-full bg-gradient-to-b from-sky-400 to-cyan-400" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Connection status */}
      <div className="border-t border-sidebar-border/50 p-3 shrink-0">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2 shrink-0">
            <span
              className={cn(
                "absolute inline-flex size-full rounded-full opacity-75",
                connectionDot,
                status === "connected" && "animate-ping",
              )}
            />
            <span
              className={cn(
                "relative inline-flex size-2 rounded-full",
                connectionDot,
              )}
            />
          </span>
          <span className="text-xs text-muted-foreground truncate">
            {connectionLabel}
          </span>
        </div>
      </div>
    </aside>
  );
}
