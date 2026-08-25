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
    neutral: "bg-white/[0.04] text-[#d0d6e0] border-white/[0.08]",
    signal: "bg-[#7170ff]/10 text-[#7170ff] border-[#7170ff]/25",
    success: "bg-[#10b981]/10 text-[#10b981] border-[#10b981]/25",
    amber: "bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/25",
    vermilion: "bg-[#f43f5e]/10 text-[#f43f5e] border-[#f43f5e]/25",
  };

  const dots = {
    neutral: "bg-[#8a8f98]",
    signal: "bg-[#7170ff]",
    success: "bg-[#10b981]",
    amber: "bg-[#f59e0b]",
    vermilion: "bg-[#f43f5e]",
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
