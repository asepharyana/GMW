"use client";

import { cn } from "@/lib/utils";
import type { ComponentPropsWithoutRef } from "react";

interface GlassPanelProps extends ComponentPropsWithoutRef<"div"> {
  dense?: boolean;
}

export function GlassPanel({
  dense = false,
  className,
  children,
  ...props
}: GlassPanelProps) {
  return (
    <div
      className={cn(
        "glass rounded-[var(--radius-panel)]",
        dense ? "p-3" : "p-4",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
