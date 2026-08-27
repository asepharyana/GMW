"use client";

import { useEffect, useRef } from "react";
import type { SignalTone } from "./ambient-context";

/**
 * Pure CSS ambient background — no WebGL, no three.js.
 * Multiple blurred gradient blobs drift via CSS keyframes.
 * Tone & intensity are driven by CSS custom properties updated from the
 * ref (no React re-renders per frame).
 */

const TONE_css: Record<SignalTone, string> = {
  signal: "45, 212, 191",
  amber: "245, 158, 11",
  vermilion: "239, 68, 68",
};

export function AmbientCanvas({
  targetRef,
}: {
  targetRef: React.MutableRefObject<{ tone: SignalTone; intensity: number }>;
}) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduce) return;

    let raf = 0;
    let last = performance.now();

    // Lerp state (start values match the inline style defaults on the element).
    let r = 45,
      g = 212,
      b = 191;
    let intensity = 0.35;
    // Last values actually written to the DOM — lets us skip `setProperty`
    // entirely once a channel settles, so the continuous loop stops invalidating
    // style/layout every frame when the ambient is static.
    let lastR = -1,
      lastG = -1,
      lastB = -1,
      lastAlpha = "-1";

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const frame = (now: number) => {
      const _dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const tgt = targetRef.current;
      const [tr, tg, tb] = TONE_css[tgt.tone].split(",").map(Number);
      const targetIntensity = 0.15 + tgt.intensity * 0.85;

      r = lerp(r, tr, 0.03);
      g = lerp(g, tg, 0.03);
      b = lerp(b, tb, 0.03);
      intensity = lerp(intensity, targetIntensity, 0.03);

      const root = mount;
      const R = Math.round(r);
      const G = Math.round(g);
      const B = Math.round(b);
      const A = intensity.toFixed(3);
      if (R !== lastR) {
        root.style.setProperty("--ab-r", String(R));
        lastR = R;
      }
      if (G !== lastG) {
        root.style.setProperty("--ab-g", String(G));
        lastG = G;
      }
      if (B !== lastB) {
        root.style.setProperty("--ab-b", String(B));
        lastB = B;
      }
      if (A !== lastAlpha) {
        root.style.setProperty("--ab-alpha", A);
        lastAlpha = A;
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [targetRef]);

  return (
    <div
      ref={mountRef}
      aria-hidden
      className="ambient-bg pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none"
      style={
        {
          "--ab-r": "45",
          "--ab-g": "212",
          "--ab-b": "191",
          "--ab-alpha": "0.35",
        } as React.CSSProperties
      }
    >
      {/* Base radial wash */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,oklch(0.2_0.04_70/0.5),oklch(0.1_0.015_70)_60%)]" />

      {/* Drifting blurred blobs — the "fog" effect */}
      <div className="ambient-blob ambient-blob-1" />
      <div className="ambient-blob ambient-blob-2" />
      <div className="ambient-blob ambient-blob-3" />

      {/* Floating motes — tiny dots drifting upward */}
      <div className="ambient-motes">
        {Array.from({ length: 30 }, (_, i) => (
          <span
            key={i}
            className="ambient-mote"
            style={{
              left: `${(i * 3.33) % 100}%`,
              animationDelay: `${(i * 0.7) % 8}s`,
              animationDuration: `${6 + (i % 5) * 2}s`,
            }}
          />
        ))}
      </div>

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,oklch(0.08_0.01_70/0.7)_100%)]" />
    </div>
  );
}
