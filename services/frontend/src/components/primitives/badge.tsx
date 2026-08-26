import type React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "signal" | "amber" | "vermilion" | "success";
  size?: "sm" | "md";
  dot?: boolean;
}

export function Badge({
  tone = "neutral",
  size = "md",
  dot = false,
  className,
  children,
  ...props
}: BadgeProps) {
  const tones = {
    neutral: "bg-surface-2 text-ink-soft border-hairline",
    signal: "bg-signal/15 text-signal border-signal/30",
    success: "bg-success/15 text-success border-success/30",
    amber: "bg-amber/15 text-amber border-amber/30",
    vermilion: "bg-vermilion/15 text-vermilion border-vermilion/30",
  };

  const dots = {
    neutral: "bg-ink-muted",
    signal: "bg-signal",
    success: "bg-success",
    amber: "bg-amber",
    vermilion: "bg-vermilion",
  };

  const sizes = {
    sm: "px-1.5 py-0.5 text-[10px]",
    md: "px-2 py-0.5 text-[11px]",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[4px] border font-mono font-medium tracking-tight",
        tones[tone],
        sizes[size],
        className,
      )}
      {...props}
    >
      {dot && <span className={cn("size-1.5 rounded-full", dots[tone])} />}
      {children}
    </span>
  );
}
