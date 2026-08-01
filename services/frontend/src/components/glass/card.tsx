"use client";

import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type GlassVariant = "base" | "elevated" | "interactive" | "danger";

interface GlassCardProps extends ComponentPropsWithoutRef<"div"> {
  variant?: GlassVariant;
}

const variantStyles: Record<GlassVariant, string> = {
  base: "glass rounded-[var(--radius-card)]",
  elevated: "glass-elevated rounded-[var(--radius-card)]",
  interactive:
    "glass rounded-[var(--radius-card)] transition-all duration-150 hover:scale-[1.01] hover:border-[var(--color-border-glow)] cursor-pointer",
  danger: "glass rounded-[var(--radius-card)] border-red-500/30",
};

export function GlassCard({
  variant = "base",
  className,
  children,
  ...props
}: GlassCardProps) {
  return (
    <div className={cn(variantStyles[variant], "p-5", className)} {...props}>
      {children}
    </div>
  );
}
