"use client";

import { useEffect, useRef, useState } from "react";
import { GlassPanel } from "@/components/glass/panel";
import { X } from "lucide-react";

interface RecordingPlayerProps {
  url?: string;
  filename?: string;
  onClose: () => void;
}

export function RecordingPlayer({ url, filename, onClose }: RecordingPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!url || !audio) return;
    setError(false);
    // Fresh element state: reset src, load, then play (the click that opened
    // the player counts as a user gesture, so autoplay is allowed).
    audio.src = url;
    audio.load();
    const p = audio.play();
    if (p) p.catch(() => setError(true));
  }, [url]);

  if (!url) return null;

  return (
    <GlassPanel dense className="fixed bottom-20 left-4 z-30 w-80 flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <audio
          ref={audioRef}
          controls
          preload="auto"
          className="flex-1 h-8 [&::-webkit-media-controls-panel]:bg-transparent"
          onError={() => setError(true)}
        />
        <button type="button" onClick={onClose} className="shrink-0">
          <X className="size-3.5 text-text-secondary/60 hover:text-text-primary" />
        </button>
      </div>
      <div className="flex items-center justify-between px-0.5">
        <span className="truncate text-[10px] font-mono text-text-secondary/60">
          {filename ?? "recording"}
        </span>
        {error && (
          <span className="shrink-0 text-[10px] text-red-400/90">
            playback failed
          </span>
        )}
      </div>
    </GlassPanel>
  );
}
