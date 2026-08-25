"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { type RefObject, useRef } from "react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP);
}

/**
 * Reusable hook for staggered reveal animations on child elements.
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
          y: options?.y ?? 12,
          scale: 0.98,
        },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: options?.duration ?? 0.35,
          delay: options?.delay ?? 0.05,
          stagger: options?.stagger ?? 0.04,
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

/**
 * Animated number counter using GSAP.
 */
export function useCounter(
  targetValue: number,
  ref: RefObject<HTMLElement | null>,
  formatter?: (val: number) => string,
) {
  useGSAP(
    () => {
      if (!ref.current) return;
      const obj = { val: 0 };
      gsap.to(obj, {
        val: targetValue,
        duration: 0.8,
        ease: "power2.out",
        onUpdate: () => {
          if (ref.current) {
            ref.current.textContent = formatter
              ? formatter(obj.val)
              : Math.round(obj.val).toLocaleString();
          }
        },
      });
    },
    { dependencies: [targetValue] },
  );
}
