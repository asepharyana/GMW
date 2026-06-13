import { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  levels: number[];
}

export function AudioVisualizer({ levels }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ro = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = 128 * dpr;
      canvas.style.height = "128px";
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    const barWidth = width / levels.length;
    const maxBarHeight = height * 0.85;

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#23a1eb");
    gradient.addColorStop(1, "#3eb0f2");

    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      const barHeight = Math.min(maxBarHeight, level * maxBarHeight);
      const x = i * barWidth;
      const y = height - barHeight;

      ctx.fillStyle = gradient;

      const radius = barWidth * 0.4;
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + barWidth - radius, y);
      ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
      ctx.lineTo(x + barWidth, height);
      ctx.lineTo(x, height);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.fill();
    }
  }, [levels]);

  return (
    <div ref={containerRef} className="relative w-full">
      <canvas
        ref={canvasRef}
        width={0}
        height={0}
        className="w-full rounded-lg bg-primary/5"
        style={{ height: "128px" }}
      />
    </div>
  );
}
