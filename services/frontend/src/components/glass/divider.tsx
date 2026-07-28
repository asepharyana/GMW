"use client";

import { cn } from "@/lib/utils";

export function GlassDivider({ className }: { className?: string }) {
  return (
    <div className={cn("h-px bg-gradient-to-r from-transparent via-oklch(1 0 0 / 0.08) to-transparent", className)} />
  );
}
