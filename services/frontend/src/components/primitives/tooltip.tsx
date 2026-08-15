"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Lightweight hover/focus tooltip. */
export function Tooltip({
  label,
  children,
  side = "top",
}: {
  label: string;
  children: React.ReactNode;
  side?: "top" | "bottom";
}) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          role="tooltip"
          className={cn(
            "glass pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap px-2.5 py-1 text-xs text-ink",
            side === "top" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]",
          )}
          style={{ animation: "fade-up 0.12s ease" }}
        >
          {label}
        </span>
      )}
    </span>
  );
}
