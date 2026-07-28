"use client";

import { useEffect, useRef } from "react";
import { GlassPanel } from "@/components/glass/panel";
import type { ActiveSpeaker } from "@/lib/types";

interface SpeakerWaveformProps {
  speakers: ActiveSpeaker[];
}

export function SpeakerWaveform({ speakers }: SpeakerWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || speakers.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barCount = 40;
      const barWidth = canvas.width / barCount - 1;

      speakers.forEach((speaker, si) => {
        const yBase = si * 30 + 10;
        for (let i = 0; i < barCount; i++) {
          const height = speaker.speaking
            ? Math.random() * 20 + 4
            : Math.random() * 4 + 2;
          const x = i * (barWidth + 1);
          const hue = 185 + si * 30;
          ctx.fillStyle = `oklch(0.62 ${0.12 + si * 0.02} ${hue} / ${speaker.speaking ? 0.9 : 0.3})`;
          ctx.fillRect(x, yBase + 20 - height, barWidth, height);
        }
      });

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [speakers]);

  if (speakers.length === 0) {
    return (
      <GlassPanel dense>
        <span className="text-xs text-text-secondary/40">No speakers detected</span>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel dense>
      <div className="space-y-1">
        {speakers.map((s) => (
          <div key={s.userId} className="flex items-center gap-2 text-xs">
            <span
              className={s.speaking ? "text-primary font-medium" : "text-text-secondary/60"}
            >
              {s.username}
            </span>
          </div>
        ))}
      </div>
      <canvas
        ref={canvasRef}
        width={400}
        height={speakers.length * 30}
        className="w-full h-auto mt-2 rounded"
      />
    </GlassPanel>
  );
}
