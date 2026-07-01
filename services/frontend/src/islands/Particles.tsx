// ─── Particles.tsx — Canvas-based particle background island ────────────────
// Renders 30 animated particles as a decorative background layer.
// Uses requestAnimationFrame, handles resize, cleans up on unmount.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
}

const PARTICLE_COUNT = 30;
const PARTICLE_COLOR = "oklch(0.62 0.15 255 / 0.15)";
const MAX_SPEED = 0.4;
const MIN_SIZE = 2;
const MAX_SIZE = 6;

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function createParticle(w: number, h: number): Particle {
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    vx: randomRange(-MAX_SPEED, MAX_SPEED),
    vy: randomRange(-MAX_SPEED, MAX_SPEED),
    size: randomRange(MIN_SIZE, MAX_SIZE),
  };
}

export default function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    resize();
    window.addEventListener("resize", resize);

    const particles: Particle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(createParticle(canvas.width, canvas.height));
    }

    function animate() {
      if (!canvas || !ctx) return;
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = PARTICLE_COLOR;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around edges
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      animationId = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: -10 }}
    />
  );
}
