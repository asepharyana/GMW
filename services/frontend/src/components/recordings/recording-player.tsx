"use client";

import { useEffect, useRef } from "react";
import { GlassPanel } from "@/components/glass/panel";
import { X } from "lucide-react";

interface RecordingPlayerProps {
  url?: string | null;
  onClose: () => void;
}

export function RecordingPlayer({ url, onClose }: RecordingPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (url && audioRef.current) {
      audioRef.current?.play().catch(() => {});
    }
  }, [url]);

  if (!url) return null;

  return (
    <GlassPanel dense className="fixed bottom-20 left-4 z-30 w-72 flex items-center gap-3">
      <audio ref={audioRef} src={url} controls className="flex-1 h-8 [&::-webkit-media-controls-panel]:bg-transparent" autoPlay />
      <button type="button" onClick={onClose}>
        <X className="size-3.5 text-text-secondary/60 hover:text-text-primary" />
      </button>
    </GlassPanel>
  );
}
