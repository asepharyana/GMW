"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP);
  // Set default Linear-style crisp easing & duration
  gsap.defaults({
    ease: "power2.out",
    duration: 0.35,
  });
}

/**
 * Reusable hook for staggered reveal animations on child elements.
 * Linear-style: crisp entry, very subtle vertical displacement, no layout shift.
 */
export function useStaggerReveal<T extends HTMLElement = HTMLDivElement>(
  selector: string,
  options?: {
    stagger?: number;
    duration?: number;
    delay?: number;
    y?: number;
    dependencies?: unknown[];
  },
) {
  const containerRef = useRef<T>(null);

  useGSAP(
    () => {
      if (!containerRef.current) return;
      const elements = containerRef.current.querySelectorAll(selector);
      if (!elements || elements.length === 0) return;

      const prefersReduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (prefersReduced) {
        gsap.set(elements, { opacity: 1, y: 0 });
        return;
      }

      gsap.fromTo(
        elements,
        {
          opacity: 0,
          y: options?.y ?? 8,
        },
        {
          opacity: 1,
          y: 0,
          duration: options?.duration ?? 0.32,
          delay: options?.delay ?? 0.02,
          stagger: options?.stagger ?? 0.03,
          ease: "power2.out",
          clearProps: "transform",
        },
      );
    },
    {
      scope: containerRef,
      dependencies: options?.dependencies ?? [],
      revertOnUpdate: true,
    },
  );

  return containerRef;
}
