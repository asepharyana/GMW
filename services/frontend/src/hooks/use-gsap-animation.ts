"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { type RefObject, useRef } from "react";

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
        duration: 0.75,
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

/**
 * Micro-interaction hook for interactive elements (hover card tilt/glow, pulse)
 */
export function useLinearHover<T extends HTMLElement = HTMLDivElement>() {
  const elementRef = useRef<T>(null);

  useGSAP(
    (_, contextSafe) => {
      if (!elementRef.current || !contextSafe) return;
      const el = elementRef.current;

      const onEnter = contextSafe(() => {
        gsap.to(el, { y: -2, duration: 0.18, ease: "power2.out" });
      });
      const onLeave = contextSafe(() => {
        gsap.to(el, { y: 0, duration: 0.22, ease: "power2.out" });
      });

      el.addEventListener("mouseenter", onEnter);
      el.addEventListener("mouseleave", onLeave);

      return () => {
        el.removeEventListener("mouseenter", onEnter);
        el.removeEventListener("mouseleave", onLeave);
      };
    },
    { scope: elementRef },
  );

  return elementRef;
}
