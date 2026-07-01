// ─── AudioVisualizer.tsx — Canvas-based frequency bar visualizer ────────────
// Uses requestAnimationFrame to draw placeholder random frequency bars.
// Bar color uses the OKLCH primary token at varying opacity.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  barCount?: number;
  height?: number;
}

export default function AudioVisualizer({
  barCount = 48,
  height = 32,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let animationId: number;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = height * dpr;
    };

    resize();

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const w = canvas.getBoundingClientRect().width;
      const h = height;
      const barWidth = w / barCount;
      const maxBarHeight = h * 0.85;

      for (let i = 0; i < barCount; i++) {
        // Random bar height as a placeholder (real data from WebSocket)
        const barHeight = Math.random() * maxBarHeight;
        const x = i * barWidth;
        const y = h - barHeight;

        // Vary opacity across bars for a more dynamic look
        const opacity = 0.3 + Math.random() * 0.7;
        ctx.fillStyle = `oklch(0.62 0.15 255 / ${opacity})`;

        // Rounded-top bars
        const radius = Math.min(barWidth * 0.3, 4);
        const gap = 1;

        ctx.beginPath();
        ctx.moveTo(x + gap + radius, y);
        ctx.lineTo(x + barWidth - gap - radius, y);
        ctx.quadraticCurveTo(
          x + barWidth - gap,
          y,
          x + barWidth - gap,
          y + radius,
        );
        ctx.lineTo(x + barWidth - gap, h);
        ctx.lineTo(x + gap, h);
        ctx.lineTo(x + gap, y + radius);
        ctx.quadraticCurveTo(x + gap, y, x + gap + radius, y);
        ctx.fill();
      }

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [barCount, height]);

  return (
    <div className="relative w-full">
      <canvas
        ref={canvasRef}
        className="w-full rounded-lg bg-primary/5"
        style={{ height: `${height}px` }}
      />
    </div>
  );
}
