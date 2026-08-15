"use client";

import { useEffect, useRef } from "react";

/**
 * AmbientField — full-bleed WebGL particle haze that reacts to live data.
 *
 * No container, no grid, no chrome. Pure atmosphere: a slow-drifting field of
 * points whose motion density tracks server load, and whose color shifts with
 * the latest moderation signal (clean → lime, warn → amber, flagged → vermilion).
 *
 * This is the background of the new dashboard — everything else floats over it.
 */

type Signal = "neutral" | "signal" | "amber" | "vermilion";

const SIGNAL_RGB: Record<Signal, [number, number, number]> = {
  neutral: [0.52, 0.49, 0.46],
  signal: [0.78, 0.85, 0.62],
  amber: [0.95, 0.78, 0.42],
  vermilion: [0.86, 0.32, 0.28],
};

interface AmbientFieldProps {
  /** 0..1 — drives particle drift speed + density. */
  load?: number;
  /** Latest moderation signal — tints the haze. */
  signal?: Signal;
}

export function AmbientField({
  load = 0.3,
  signal = "signal",
}: AmbientFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadRef = useRef(load);
  const signalRef = useRef<[number, number, number]>(SIGNAL_RGB[signal]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    signalRef.current = SIGNAL_RGB[signal];
  }, [signal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Particle haze
    const N = 90;
    const pts = Array.from({ length: N }, () => ({
      x: Math.random(),
      y: Math.random(),
      z: Math.random() * 0.8 + 0.2,
      vx: (Math.random() - 0.5) * 0.0004,
      vy: (Math.random() - 0.5) * 0.0004,
      r: Math.random() * 1.5 + 0.5,
    }));

    const draw = () => {
      const [cr, cg, cb] = signalRef.current;
      const speed = 0.4 + loadRef.current * 1.6;

      // Trail fade
      ctx.fillStyle = "rgba(244, 240, 234, 0.06)";
      ctx.fillRect(0, 0, w, h);

      for (const p of pts) {
        p.x += p.vx * speed;
        p.y += p.vy * speed;
        if (p.x < 0) p.x += 1;
        if (p.x > 1) p.x -= 1;
        if (p.y < 0) p.y += 1;
        if (p.y > 1) p.y -= 1;

        const px = p.x * w;
        const py = p.y * h;
        const rad = p.r * p.z * (1 + loadRef.current);
        const alpha = 0.05 + p.z * 0.12;
        ctx.beginPath();
        ctx.arc(px, py, rad, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${Math.round(cr * 255)}, ${Math.round(cg * 255)}, ${Math.round(cb * 255)}, ${alpha})`;
        ctx.fill();
      }

      // Faint vignette glow center
      const grad = ctx.createRadialGradient(
        w / 2,
        h / 2,
        0,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.6,
      );
      grad.addColorStop(
        0,
        `rgba(${Math.round(cr * 255)}, ${Math.round(cg * 255)}, ${Math.round(cb * 255)}, 0.03)`,
      );
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
    />
  );
}
