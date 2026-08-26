"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * CSS-powered page transition wrapper.
 * Applies fade-scale-in animation on mount. Respects reduced-motion.
 */
export function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.style.animation = "fade-scale-in 0.4s ease-out forwards";
    return () => {
      el.style.removeProperty("animation");
    };
  }, []);

  return (
    <div ref={containerRef} className={cn("w-full opacity-0", className)}>
      {children}
    </div>
  );
}
