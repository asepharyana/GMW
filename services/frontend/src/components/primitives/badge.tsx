import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "signal" | "amber" | "vermilion" | "neutral";

const toneClass: Record<BadgeTone, string> = {
  signal: "bg-[var(--color-signal)]/15 text-[var(--color-signal)]",
  amber: "bg-[var(--color-amber)]/15 text-[var(--color-amber)]",
  vermilion: "bg-[var(--color-vermilion)]/15 text-[var(--color-vermilion)]",
  neutral: "bg-[var(--color-hairline)] text-[var(--color-ink-soft)]",
};

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}

export function Badge({
  tone = "neutral",
  children,
  className,
  dot,
}: BadgeProps) {
  return (
    <span className={cn("pill", toneClass[tone], className)}>
      {dot && (
        <span
          className={cn(
            "size-1.5 rounded-full",
            tone === "signal" && "bg-[var(--color-signal)]",
            tone === "amber" && "bg-[var(--color-amber)]",
            tone === "vermilion" && "bg-[var(--color-vermilion)]",
            tone === "neutral" && "bg-[var(--color-ink-soft)]",
          )}
        />
      )}
      {children}
    </span>
  );
}
