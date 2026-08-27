"use client";

import { Radio } from "lucide-react";
import { useEffect, useRef } from "react";
import { Avatar } from "@/components/primitives";
import type { ActiveSpeaker } from "@/lib/types";

export function VoiceStage({ speakers }: { speakers: ActiveSpeaker[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Only show actively speaking users on the stage orbit
  const activeSpeakers = speakers.filter((s) => s.speaking);
  const n = activeSpeakers.length;
  const totalConnected = speakers.length;
  const live = n > 0;

  // CSS stagger reveal for speaker nodes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const nodes = container.querySelectorAll<HTMLElement>(".speaker-node");
    if (nodes.length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    nodes.forEach((el, i) => {
      el.style.opacity = "0";
      el.style.animationFillMode = "forwards";
      el.style.animationTimingFunction = "cubic-bezier(0.34, 1.56, 0.64, 1)";
      el.style.animationName = "scale-bounce-in";
      el.style.animationDuration = "0.4s";
      el.style.animationDelay = `${i * 0.05}s`;
    });

    return () => {
      nodes.forEach((el) => {
        el.style.removeProperty("opacity");
        el.style.removeProperty("animation-name");
        el.style.removeProperty("animation-duration");
        el.style.removeProperty("animation-delay");
        el.style.removeProperty("animation-fill-mode");
        el.style.removeProperty("animation-timing-function");
      });
    };
  }, []);

  // CSS pulse ring for active speakers
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rings = container.querySelectorAll<HTMLElement>(
      ".speaker-pulse-ring",
    );
    if (rings.length === 0) return;

    rings.forEach((el, i) => {
      el.style.animationName = "pulse-ring";
      el.style.animationDuration = "1.1s";
      el.style.animationTimingFunction = "sine.in-out";
      el.style.animationIterationCount = "infinite";
      el.style.animationDelay = `${i * 0.08}s`;
    });

    return () => {
      rings.forEach((el) => {
        el.style.removeProperty("animation-name");
        el.style.removeProperty("animation-duration");
        el.style.removeProperty("animation-timing-function");
        el.style.removeProperty("animation-iteration-count");
        el.style.removeProperty("animation-delay");
      });
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative mx-auto aspect-square w-full max-w-[380px]"
    >
      <div className="absolute inset-4 rounded-full border border-hairline/30" />
      <div className="absolute inset-12 rounded-full border border-dashed border-hairline/40 animate-spin-disc radar-sweep" />
      <div className="absolute left-1/2 top-1/2 size-80 -translate-x-1/2 -translate-y-1/2 rounded-full border border-hairline/20" />
      <div
        className="absolute left-1/2 top-1/2 size-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal/5 transition-opacity duration-500"
        style={{ opacity: live ? 1 : 0.2 }}
      />

      <div
        className="absolute left-1/2 top-1/2 flex size-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border backdrop-blur-md transition-all duration-300"
        style={{
          borderColor: live ? "var(--color-signal)" : "var(--color-hairline)",
          boxShadow: live ? "0 0 50px -8px var(--color-signal-glow)" : "none",
          background: "oklch(0.15 0.02 70 / 0.7)",
        }}
      >
        <Radio
          className={`size-7 transition-colors ${live ? "text-signal animate-breathe" : "text-ink-faint"}`}
        />
        <span className="font-mono mt-1 text-[11px] font-bold tracking-wider text-ink uppercase">
          {live ? `${n} SPEAKING` : `${totalConnected} CONNECTED`}
        </span>
      </div>

      {activeSpeakers.map((s, i) => {
        const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
        const radius = 44;
        const x = 50 + radius * Math.cos(angle);
        const y = 50 + radius * Math.sin(angle);
        return (
          <div
            key={s.userId}
            className="speaker-node absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <div className="relative flex flex-col items-center gap-1.5">
              <span className="relative">
                <Avatar
                  src={s.avatar}
                  name={s.username}
                  size={50}
                  ring={s.speaking}
                />
                {s.speaking && (
                  <span className="speaker-pulse-ring absolute -inset-1 rounded-full ring-2 ring-signal ring-offset-2 ring-offset-canvas" />
                )}
              </span>
              <span className="font-mono max-w-[100px] truncate rounded-md border border-hairline bg-canvas-2/90 px-2 py-0.5 text-[10px] font-semibold text-ink shadow-md backdrop-blur-md">
                {s.username}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
