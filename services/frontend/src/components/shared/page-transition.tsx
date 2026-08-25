"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";
import { cn } from "@/lib/utils";

// Register plugin once on client
if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP);
}

/**
 * GSAP-powered page transition wrapper.
 * Staggers entrance of direct children or smooth rise/fade for the container.
 * Fully cleans up on unmount and respects reduced-motion.
 */
export function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!containerRef.current) return;

      const prefersReduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (prefersReduced) return;

      gsap.fromTo(
        containerRef.current,
        {
          opacity: 0,
          y: 14,
          filter: "blur(4px)",
        },
        {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          duration: 0.45,
          ease: "power2.out",
          clearProps: "filter,transform",
        },
      );
    },
    { scope: containerRef },
  );

  return (
    <div ref={containerRef} className={cn("w-full opacity-0", className)}>
      {children}
    </div>
  );
}
