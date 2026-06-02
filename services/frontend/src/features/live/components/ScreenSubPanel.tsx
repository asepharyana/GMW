import { MonitorUp, SkipForward, Square } from "lucide-react";
import { useState } from "react";
import { Button, Input } from "../../../shared/ui";

interface ScreenSubPanelProps {
  onStart: (source: string) => void;
  onSkip: () => void;
  onStop: () => void;
  loading: boolean;
}

export function ScreenSubPanel({
  onStart,
  onSkip,
  onStop,
  loading,
}: ScreenSubPanelProps) {
  const [source, setSource] = useState("");
  const submit = () => {
    const t = source.trim();
    if (!t) return;
    onStart(t);
    setSource("");
  };

  return (
    <div className="rounded-2xl border border-sky-200 bg-white p-4 shadow-md space-y-4">
      <Input
        value={source}
        onChange={(e) => setSource(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Screen share URL or local file path"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          className="bg-[#7EC8E3] text-white hover:bg-[#7EC8E3]/80"
          disabled={loading || !source.trim()}
          onClick={submit}
        >
          <MonitorUp className="mr-1.5 h-4 w-4" /> Start
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
