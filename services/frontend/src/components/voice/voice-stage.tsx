import { Radio } from "lucide-react";
import { Avatar } from "@/components/primitives";
import type { ActiveSpeaker } from "@/lib/types";

export function VoiceStage({ speakers }: { speakers: ActiveSpeaker[] }) {
  const n = speakers.length;
  const speaking = speakers.filter((s) => s.speaking).length;
  const live = speaking > 0;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[360px]">
      {/* orbiting dashed ring */}
      <div className="absolute inset-8 rounded-full border border-dashed border-hairline opacity-40 animate-spin-disc" />
      {/* ripple halos */}
      <div className="absolute left-1/2 top-1/2 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full border border-hairline" />
      <div
        className="absolute left-1/2 top-1/2 size-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal/5 animate-breathe"
        style={{ opacity: live ? 1 : 0.4 }}
      />

      {/* central core */}
      <div
        className="absolute left-1/2 top-1/2 flex size-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border backdrop-blur transition-colors"
        style={{
          borderColor: live ? "var(--color-signal)" : "var(--color-hairline)",
          boxShadow: live ? "0 0 50px -8px var(--color-signal-glow)" : "none",
          background: "oklch(1 0 0 / 0.04)",
        }}
      >
        <Radio
          className={`size-7 ${live ? "text-signal" : "text-ink-faint"}`}
        />
        <span className="mono mt-1 text-xs text-ink-soft">{n} live</span>
      </div>

      {/* speakers on orbit */}
      {speakers.map((s, i) => {
        const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
        const radius = 42;
        const x = 50 + radius * Math.cos(angle);
        const y = 50 + radius * Math.sin(angle);
        return (
          <div
            key={s.userId}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <div className="relative flex flex-col items-center gap-1">
              <span className="relative">
                <Avatar
                  src={s.avatar}
                  name={s.username}
                  size={46}
                  ring={s.speaking}
                />
                {s.speaking && (
                  <span className="absolute inset-0 rounded-full ring-2 ring-signal animate-pulse-ring" />
                )}
              </span>
              <span className="mono max-w-[88px] truncate rounded-full bg-black/40 px-2 py-0.5 text-[0.6rem] text-ink-soft">
                {s.username}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
