import { Music2, SkipForward, Square, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const [muted, setMuted] = useState(false);
  const prevVolumeRef = useRef(safeVolume);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Proper debounce: setTimeout instead of setInterval polling
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const normalized = draftVolume / 100;
      if (Math.abs(normalized - safeVolume) >= 0.001)
        onVolumeChange(normalized);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [draftVolume, safeVolume, onVolumeChange]);

  const handleMute = useCallback(() => {
    if (muted) {
      // Unmute: restore previous volume
      const restore = prevVolumeRef.current;
      setDraftVolume(Math.round(restore * 100));
      onVolumeChange(restore);
      setMuted(false);
    } else {
      // Mute: save current, set to 0
      prevVolumeRef.current = safeVolume;
      setDraftVolume(0);
      onVolumeChange(0);
      setMuted(true);
    }
  }, [muted, safeVolume, onVolumeChange]);

  const submit = () => {
    const t = source.trim();
    if (!t) return;
    onQueue(t);
    setSource("");
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-4">
      <Input
        value={source}
        onChange={(e) => setSource(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="YouTube URL, Spotify track, or search terms"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleMute}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={draftVolume}
          onChange={(e) => {
            setDraftVolume(Number(e.target.value));
            if (muted) setMuted(false);
          }}
          className="h-2 w-full cursor-pointer accent-primary"
        />
        <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
          {draftVolume}%
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={loading || !source.trim()} onClick={submit}>
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
