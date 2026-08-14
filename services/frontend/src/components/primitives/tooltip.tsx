"use client";

import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

const sidePos: Record<NonNullable<TooltipProps["side"]>, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: TooltipProps) {
  const [show, setShow] = useState(false);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: tooltip wrapper — reveals on hover AND focus (keyboard-accessible via focus handlers above)
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 whitespace-nowrap rounded-[var(--radius-r-control)] px-2.5 py-1 text-xs font-medium",
          "bg-[var(--color-ink)] text-[var(--color-canvas)] opacity-0 transition-opacity duration-150",
          sidePos[side],
          show && "opacity-100",
          className,
        )}
      >
        {content}
      </span>
    </span>
  );
}
