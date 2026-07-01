// ─── ActiveSpeakers.tsx — Live voice speaker list island ────────────────────
// Self-contained: reads from useVoiceStore, renders speaker entries with
// animated speaking-indicator bars.
// ─────────────────────────────────────────────────────────────────────────────

import { useVoiceStore } from "../stores/voice-store.js";

export default function ActiveSpeakers() {
  const activeSpeakers = useVoiceStore((state) => state.activeSpeakers);

  if (activeSpeakers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
        <div className="mb-2 text-3xl opacity-30">&#x1F399;</div>
        <p className="text-sm">No active speakers</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {activeSpeakers.map((speaker) => {
        const key =
          speaker.userId ?? speaker.id ?? `speaker-${speaker.username}`;
        return (
          <div
            key={key}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
          >
            <img
              src={speaker.avatar}
              alt=""
              className="h-8 w-8 rounded-full object-cover ring-2 ring-primary/30"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {speaker.username}
              </div>
            </div>
            {speaker.speaking && (
              <div className="flex items-end gap-[3px]">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="w-[5px] rounded-full bg-primary animate-bar-pulse"
                    style={{
                      height: `${12 + i * 4}px`,
                      animationDelay: `${i * 75}ms`,
                      transformOrigin: "bottom",
                      opacity: 1 - i * 0.12,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
