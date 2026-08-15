import { cn } from "@/lib/utils";

function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name
    .replace(/[^\p{L}\p{N} _]/gu, "")
    .trim()
    .split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  src,
  name,
  size = 36,
  className,
  ring,
}: {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  const dim = { width: size, height: size };
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        "bg-gradient-to-br from-white/10 to-white/[0.02] text-ink-soft",
        ring && "ring-2 ring-signal/50",
        className,
      )}
      style={dim}
    >
      {src ? (
        <span
          aria-label={name ?? "avatar"}
          role="img"
          className="h-full w-full bg-cover bg-center"
          style={{ backgroundImage: `url("${src}")` }}
        />
      ) : (
        <span
          className="font-semibold"
          style={{ fontSize: Math.max(10, size * 0.36) }}
        >
          {initials(name)}
        </span>
      )}
    </span>
  );
}
