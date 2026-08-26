"use client";

import { useEffect, useRef } from "react";

/**
 * CSS-based stagger reveal. Applies `.stagger-in` class with incremental
 * `animation-delay` to matching children when they enter the viewport.
 * No GSAP — pure CSS keyframes + IntersectionObserver.
 *
 * Add this to globals.css if not already present:
 *   @keyframes stagger-in { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
 *   .stagger-in { opacity:0; animation: stagger-in 0.32s ease-out forwards }
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const elements = container.querySelectorAll<HTMLElement>(selector);
    if (!elements || elements.length === 0) return;

    if (prefersReduced) {
      elements.forEach((el) => {
        el.style.opacity = "1";
        el.style.transform = "none";
      });
      return;
    }

    const staggerSec = options?.stagger ?? 0.03;
    const durationSec = options?.duration ?? 0.32;
    const baseDelay = options?.delay ?? 0;

    elements.forEach((el, i) => {
      el.style.opacity = "0";
      el.style.animationFillMode = "forwards";
      el.style.animationTimingFunction = "ease-out";
      el.style.animationName = "stagger-in";
      el.style.animationDuration = `${durationSec}s`;
      el.style.animationDelay = `${baseDelay + i * staggerSec}s`;
    });

    // Cleanup: remove inline styles so next re-render can re-apply
    return () => {
      elements.forEach((el) => {
        el.style.removeProperty("opacity");
        el.style.removeProperty("animation-name");
        el.style.removeProperty("animation-duration");
        el.style.removeProperty("animation-delay");
        el.style.removeProperty("animation-fill-mode");
        el.style.removeProperty("animation-timing-function");
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, options?.dependencies ?? []);

  return containerRef;
}
