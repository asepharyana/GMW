"use client";

import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MicControlProps {
  connected: boolean;
  active: boolean;
  onToggle: (active: boolean) => void;
  volume: number;
  onVolumeChange: (v: number) => void;
}

export function MicControl({
  connected,
  active,
  onToggle,
  volume,
  onVolumeChange,
}: MicControlProps) {
  return (
    <Card className={cn("[--card-spacing:0px]", "rounded-2xl", "p-5")}>
      <div className="flex items-center gap-3">
        <Button
          variant={active ? "default" : "secondary"}
          size="sm"
          onClick={() => onToggle(!active)}
          disabled={!connected}
          className="h-9"
        >
          {active ? (
            <Mic className="size-4 mr-1" />
          ) : (
            <MicOff className="size-4 mr-1" />
          )}
          {active ? "Live" : "Muted"}
        </Button>
        <div className="flex-1 flex items-center gap-2">
          <span className="text-[10px] text-text-secondary/60 font-mono">
            Vol
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            className="flex-1 h-1 appearance-none bg-glass-border rounded-full accent-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-[0_0_8px] [&::-webkit-slider-thumb]:shadow-primary/60"
          />
          <span className="text-[10px] font-mono text-text-secondary w-8 text-right">
            {volume}%
          </span>
        </div>
      </div>
    </Card>
  );
}
