"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Radio } from "lucide-react";
import { useRef } from "react";
import { Avatar } from "@/components/primitives";
import type { ActiveSpeaker } from "@/lib/types";

if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP);
}

export function VoiceStage({ speakers }: { speakers: ActiveSpeaker[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const n = speakers.length;
  const speaking = speakers.filter((s) => s.speaking).length;
  const live = speaking > 0;

  useGSAP(
    () => {
      if (!containerRef.current) return;
      const speakerNodes =
        containerRef.current.querySelectorAll(".speaker-node");
      if (speakerNodes.length > 0) {
        gsap.fromTo(
          speakerNodes,
          { scale: 0.7, opacity: 0 },
          {
            scale: 1,
            opacity: 1,
            duration: 0.4,
            stagger: 0.05,
            ease: "back.out(1.5)",
          },
        );
      }
    },
    { scope: containerRef, dependencies: [speakers.length] },
  );

  return (
    <div
      ref={containerRef}
      className="relative mx-auto aspect-square w-full max-w-[380px]"
    >
      {/* Tactical radar coordinate grids & rings */}
      <div className="absolute inset-4 rounded-full border border-hairline/30" />
      <div className="absolute inset-12 rounded-full border border-dashed border-hairline/40 animate-spin-disc" />
      <div className="absolute left-1/2 top-1/2 size-80 -translate-x-1/2 -translate-y-1/2 rounded-full border border-hairline/20" />
      <div
        className="absolute left-1/2 top-1/2 size-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal/5 transition-opacity duration-500"
        style={{ opacity: live ? 1 : 0.2 }}
      />

      {/* Central Command Beacon */}
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
          {live ? `${speaking} SPEAKING` : `${n} CONNECTED`}
        </span>
      </div>

      {/* Orbiting Speakers */}
      {speakers.map((s, i) => {
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
                  <span className="absolute -inset-1 rounded-full ring-2 ring-signal ring-offset-2 ring-offset-canvas animate-pulse-ring" />
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
