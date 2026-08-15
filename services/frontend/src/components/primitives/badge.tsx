import { cn } from "@/lib/utils";

type Tone = "signal" | "amber" | "vermilion" | "neutral";

const tones: Record<Tone, string> = {
  signal: "bg-signal/12 text-signal border-signal/30",
  amber: "bg-amber/12 text-amber border-amber/30",
  vermilion: "bg-vermilion/12 text-vermilion border-vermilion/30",
  neutral: "bg-white/6 text-ink-soft border-white/10",
};

export function Badge({
  tone = "neutral",
  dot,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.7rem] font-semibold tracking-wide",
        tones[tone],
        className,
      )}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-current opacity-60 animate-pulse-ring" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}
