"use client";

import { UserCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActiveSpeaker } from "@/lib/types";

interface ActiveSpeakersPanelProps {
  activeSpeakers: ActiveSpeaker[];
}

export function ActiveSpeakersPanel({
  activeSpeakers,
}: ActiveSpeakersPanelProps) {
  if (activeSpeakers.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <UserCheck className="size-4 text-primary" />
          Active Speakers
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {activeSpeakers.map((s) => (
            <div
              key={s.userId}
              className="flex items-center gap-2 rounded-full border border-border/50 bg-card px-3 py-1.5 shadow-sm"
            >
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full rounded-full bg-green-400 opacity-75 live-pulse-ring" />
                <span className="relative inline-flex size-2 rounded-full bg-green-500" />
              </span>
              <span className="text-sm">{s.username}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
