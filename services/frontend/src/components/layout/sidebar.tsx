"use client";

import { Radio } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  Sidebar as SidebarPrimitive,
  useSidebar,
} from "@/components/ui/sidebar";
import { navItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/lib/ws/context";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { state } = useSidebar();
  const { status } = useWebSocket();
  const collapsed = state === "collapsed";

  const isActive = (matchPrefix: string) => {
    if (matchPrefix === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(matchPrefix);
  };

  const connectionLabel = {
    connected: "Connected",
    connecting: "Connecting",
    disconnected: "Disconnected",
    error: "Error",
  }[status];

  const connectionColor = {
    connected: "bg-green-500",
    connecting: "bg-yellow-500",
    disconnected: "bg-destructive",
    error: "bg-destructive",
  }[status];

  return (
    <SidebarPrimitive variant="sidebar" collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border/50">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="group-data-[collapsible=icon]:!p-0"
              onClick={() => router.push("/dashboard")}
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-400 text-sidebar-primary-foreground">
                <Radio className="size-4" />
              </div>
              <div
                className={cn(
                  "flex flex-col gap-0.5 leading-none",
                  collapsed && "hidden",
                )}
              >
                <span className="text-base font-bold tracking-tight">
                  <span className="text-gradient">Bete</span>
                </span>
                <span className="text-[10px] text-muted-foreground tracking-widest uppercase">
                  Dashboard
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map(({ href, label, icon: Icon, matchPrefix }) => {
                const active = isActive(matchPrefix);
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={collapsed ? label : undefined}
                      className={cn(
                        "relative transition-all duration-200",
                        active &&
                          "bg-sidebar-accent/80 text-sidebar-accent-foreground font-medium",
                      )}
                      onClick={() => router.push(href)}
                    >
                      <Icon
                        className={cn(
                          "size-4 transition-all duration-200",
                          active && "text-sky-400 scale-110",
                        )}
                      />
                      <span>{label}</span>
                      {active && (
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-gradient-to-b from-sky-400 to-cyan-400" />
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/50 p-3">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2 shrink-0">
            <span
              className={cn(
                "absolute inline-flex size-full rounded-full opacity-75",
                connectionColor,
                status === "connected" && "animate-ping",
              )}
            />
            <span
              className={cn(
                "relative inline-flex size-2 rounded-full",
                connectionColor,
              )}
            />
          </span>
          {!collapsed && (
            <span className="text-xs text-muted-foreground truncate">
              {connectionLabel}
            </span>
          )}
        </div>
      </SidebarFooter>
    </SidebarPrimitive>
  );
}
