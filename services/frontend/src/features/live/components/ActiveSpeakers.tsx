import type { ActiveSpeaker } from "../../../entities/voice/types.js";
import { EmptyStateMascot } from "../../../widgets/mascot/MascotImage";

interface ActiveSpeakersProps {
  speakers: ActiveSpeaker[];
}

export function ActiveSpeakers({ speakers }: ActiveSpeakersProps) {
  if (speakers.length === 0) {
    return <EmptyStateMascot />;
  }

  return (
    <div className="space-y-2">
      {speakers.map((s) => {
        const key = s.userId ?? s.id ?? `speaker-${s.username}`;
        return (
          <div
            key={key}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
          >
            <img
              src={s.avatar}
              alt=""
              className="h-8 w-8 rounded-full object-cover ring-2 ring-primary/30"
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{s.username}</div>
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    s.speaking ? "bg-emerald-500" : "bg-muted-foreground/40"
                  }`}
                />
                <span
                  className={`text-xs font-medium ${
                    s.speaking ? "text-success" : "text-muted-foreground"
                  }`}
                >
                  {s.speaking ? "Speaking" : "Silent"}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
