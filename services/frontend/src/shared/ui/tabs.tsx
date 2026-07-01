/* ═══════════════════════════════════════════════════════════════════════════
 * IMPHNEN Tabs — Radix-based, style sesuai Approachable Modernism
 * ═══════════════════════════════════════════════════════════════════════════ */

import * as TabsPrimitive from "@radix-ui/react-tabs";
import type * as React from "react";
import { cn } from "../lib/utils";

export const Tabs = TabsPrimitive.Root;

export function TabsList({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "inline-flex h-10 items-center justify-center",
        "rounded-lg bg-[#f5f5f5] p-1",
        "text-[#666666]",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap",
        "rounded-lg px-3 py-1.5",
        "font-sans text-sm font-medium",
        "transition-all duration-[150ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#23a1eb]/40",
        "disabled:pointer-events-none disabled:opacity-50",
        "data-[state=active]:bg-white data-[state=active]:text-[#1a1a1a] data-[state=active]:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn(
        "mt-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#23a1eb]/40",
        className,
      )}
      {...props}
    />
  );
}
