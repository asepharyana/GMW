import gsap from "gsap";
import { useCallback, useEffect, useRef } from "react";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useGsapTransition(tabKey: string) {
  const pageRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<gsap.Context | null>(null);

  const animateIn = useCallback(() => {
    // Kill any previously recorded animations to prevent conflicts
    ctxRef.current?.kill();

    const instant = prefersReducedMotion();
    const scope = pageRef.current ?? undefined;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline();

      // Page container: fade-in + slide-up (400ms ease-out)
      if (pageRef.current) {
        tl.fromTo(
          pageRef.current,
          { opacity: 0, y: 20 },
          {
            opacity: 1,
            y: 0,
            duration: instant ? 0 : 0.4,
            ease: "power2.out",
          },
        );
      }

      // Stagger children with data-stagger attribute
      const staggerEls =
        pageRef.current?.querySelectorAll<HTMLElement>("[data-stagger]");
      if (staggerEls && staggerEls.length > 0) {
        tl.fromTo(
          staggerEls,
          { opacity: 0, y: 15 },
          {
            opacity: 1,
            y: 0,
            duration: instant ? 0 : 0.3,
            stagger: instant ? 0 : 0.05,
            ease: "power2.out",
          },
          "-=0.1",
        );
      }
    }, scope);

    ctxRef.current = ctx;
  }, [tabKey]);

  const animateOut = useCallback((): Promise<void> => {
    // Kill any previously recorded animations to prevent conflicts
    ctxRef.current?.kill();

    return new Promise<void>((resolve) => {
      const instant = prefersReducedMotion();
      const scope = pageRef.current ?? undefined;

      const ctx = gsap.context(() => {
        const tl = gsap.timeline({
          onComplete: () => {
            resolve();
          },
        });

        if (pageRef.current) {
          // Page container: fade-out + slide-down (300ms ease-in)
          tl.to(pageRef.current, {
            opacity: 0,
            y: 20,
            duration: instant ? 0 : 0.3,
            ease: "power2.in",
          });
        } else {
          // No element to animate — resolve immediately
          resolve();
        }
      }, scope);

      ctxRef.current = ctx;
    });
  }, [tabKey]);

  // Cleanup all recorded animations on unmount
  useEffect(() => {
    return () => {
      ctxRef.current?.kill();
    };
  }, []);

  return { pageRef, animateIn, animateOut };
}

function gsapCardHover() {
  return {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      gsap.to(e.currentTarget, {
        y: -4,
        boxShadow: "0 8px 25px rgba(0,0,0,0.15)",
        duration: 0.2,
        ease: "power2.out",
        overwrite: "auto",
      });
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      gsap.to(e.currentTarget, {
        y: 0,
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        duration: 0.2,
        ease: "power2.out",
        overwrite: "auto",
      });
    },
  };
}
