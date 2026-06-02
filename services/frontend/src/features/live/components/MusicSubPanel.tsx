import { Music2, SkipForward, Square, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Input } from "../../../shared/ui";

interface MusicSubPanelProps {
  volume: number;
  onVolumeChange: (v: number) => void;
  onQueue: (source: string) => void;
  onSkip: () => void;
  onStop: () => void;
  loading: boolean;
}

export function MusicSubPanel({
  volume,
  onVolumeChange,
  onQueue,
  onSkip,
  onStop,
  loading,
}: MusicSubPanelProps) {
  const [source, setSource] = useState("");
  const safeVolume = Number.isFinite(volume)
    ? Math.max(0, Math.min(1, volume))
    : 1;
  const [draftVolume, setDraftVolume] = useState(Math.round(safeVolume * 100));

  // Debounced volume — poll every 200ms instead of instant send to avoid flood
  useEffect(() => {
    const id = setInterval(() => {
      const normalized = draftVolume / 100;
      if (Math.abs(normalized - safeVolume) >= 0.001)
        onVolumeChange(normalized);
    }, 200);
    return () => clearInterval(id);
  }, [draftVolume, safeVolume, onVolumeChange]);

  const submit = () => {
    const t = source.trim();
    if (!t) return;
    onQueue(t);
    setSource("");
  };

  return (
    <div className="rounded-2xl border border-sky-200 bg-white p-4 shadow-md space-y-4">
      <Input
        value={source}
        onChange={(e) => setSource(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="YouTube URL, Spotify track, or search terms"
      />
      <div className="flex items-center gap-3">
        <Volume2 className="h-4 w-4 shrink-0 text-[#7EC8E3]" />
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={draftVolume}
          onChange={(e) => setDraftVolume(Number(e.target.value))}
          className="h-2 w-full cursor-pointer accent-[#7EC8E3]"
        />
        <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
          {draftVolume}%
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button className="bg-[#7EC8E3] text-white hover:bg-[#7EC8E3]/80" disabled={loading || !source.trim()} onClick={submit}>
          <Music2 className="mr-1.5 h-4 w-4" /> Queue
        </Button>
        <Button variant="secondary" disabled={loading} onClick={onSkip}>
          <SkipForward className="mr-1.5 h-4 w-4" /> Skip
        </Button>
        <Button variant="destructive" disabled={loading} onClick={onStop}>
          <Square className="mr-1.5 h-4 w-4" /> Stop
        </Button>
      </div>
    </div>
  );
}
