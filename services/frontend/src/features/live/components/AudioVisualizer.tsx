import { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  levels: number[];
}

export function AudioVisualizer({ levels }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const barWidth = width / levels.length;
    const maxBarHeight = height * 0.85;

    // IMPHNEN blue gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#23a1eb");
    gradient.addColorStop(1, "#3eb0f2");

    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      const barHeight = Math.min(maxBarHeight, level * maxBarHeight);
      const x = i * barWidth;
      const y = height - barHeight;

      ctx.fillStyle = gradient;

      // More rounded bar
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
    <div className="relative w-full">
      <canvas
        ref={canvasRef}
        width={512}
        height={128}
        className="w-full rounded-lg bg-primary/5"
        style={{ height: "128px" }}
      />
    </div>
  );
}
