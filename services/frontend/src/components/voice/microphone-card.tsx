"use client";

import { Mic } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

interface MicrophoneCardProps {
  connected: boolean;
  micActive: boolean;
  onMicToggle: (checked: boolean) => void;
}

export function MicrophoneCard({
  connected,
  micActive,
  onMicToggle,
}: MicrophoneCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Mic className="size-4 text-primary" />
            Microphone
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {micActive ? "On" : "Off"}
            </span>
            <Switch
              checked={micActive}
              onCheckedChange={onMicToggle}
              disabled={!connected}
            />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!connected && (
          <p className="text-xs text-muted-foreground">
            Connect to a voice channel first.
          </p>
        )}
        {micActive && (
          <div className="flex items-center gap-2 mt-1">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full rounded-full bg-red-400 opacity-75 live-pulse-ring" />
              <span className="relative inline-flex size-2 rounded-full bg-red-500" />
            </span>
            <span className="text-sm text-muted-foreground">Transmitting…</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
