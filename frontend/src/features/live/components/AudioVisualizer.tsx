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

    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      const barHeight = Math.min(maxBarHeight, level * maxBarHeight);
      const x = i * barWidth;
      const y = height - barHeight;

      // Gradient color based on level
      const hue = 199 - level * 199;
      const saturation = 89;
      const lightness = 48 + level * 20;
      ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;

      // Rounded bar
      const radius = barWidth * 0.3;
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
        className="w-full rounded-xl bg-muted/30"
        style={{ height: "128px" }}
      />
    </div>
  );
}
