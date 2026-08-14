"use client";

import {
  Activity,
  Headphones,
  Mic,
  MicOff,
  Pause,
  Play,
  Settings,
  Wifi,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SessionRibbon } from "@/components/charts/session-ribbon";
import { StaggerGroup, StaggerItem } from "@/components/motion/stagger";
import { Badge } from "@/components/primitives/badge";
import { Button } from "@/components/primitives/button";
import { SignalField } from "@/components/three";
import { StaticFallback } from "@/components/three/static-fallback";
import { WebGLGuard } from "@/components/three/webgl-guard";
import { ActiveSpeakersPanel } from "@/components/voice/active-speakers-panel";
import { ListenControl } from "@/components/voice/listen-control";
import { MicControl } from "@/components/voice/mic-control";
import { SpeakerWaveform } from "@/components/voice/speaker-waveform";
import {
  useSpeakers,
  useVoiceConnect,
  useVoiceDisconnect,
  useVoiceListen,
} from "@/hooks";
import type { ActiveSpeaker, VoiceStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/lib/ws/context";

type VoiceTab = "stage" | "activity";

export default function VoiceView({
  initialStatus,
}: {
  initialStatus?: VoiceStatus;
}) {
  const ws = useWebSocket();
  const [tab, setTab] = useState<VoiceTab>("stage");

  const initialSpeakers = useMemo(
    () => initialStatus?.activeSpeakers ?? [],
    [initialStatus],
  );
  const { speakers, subscribe } = useSpeakers(initialSpeakers);
  const connect = useVoiceConnect();
  const disconnect = useVoiceDisconnect();
  const listen = useVoiceListen(ws);

  useEffect(() => {
    const unsub = subscribe(ws);
    return unsub;
  }, [subscribe, ws]);

  const active = speakers.filter((s) => s.speaking);

  return (
    <div className="flex flex-col gap-5">
      {/* Connection bar */}
      <div className="flex items-center gap-3">
        <Badge tone={initialStatus?.connected ? "signal" : "neutral"} dot>
          {initialStatus?.connected ? "Connected" : "Disconnected"}
        </Badge>
        {initialStatus?.activeChannelName && (
          <span className="text-sm text-[var(--color-ink-soft)]">
            #{initialStatus.activeChannelName}
          </span>
        )}
        {initialStatus?.connected ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => disconnect.mutate()}
          >
            Disconnect
          </Button>
        ) : (
          <Button
            size="sm"
            variant="primary"
            onClick={() =>
              connect.mutate({
                guildId: initialStatus?.activeGuildId ?? "",
                channelId: initialStatus?.activeChannelId ?? "",
              })
            }
          >
            Connect
          </Button>
        )}
      </div>

      {/* Stage hero */}
      <div className="surface relative flex h-[280px] items-end justify-center overflow-hidden rounded-[var(--radius-r)] p-5">
        <WebGLGuard
          fallback={
            <StaticFallback
              variant="orb"
              count={Math.max(speakers.length, 3)}
              className="absolute inset-0"
            />
          }
        >
          <SignalField
            activity={speakers.length > 0 ? 0.6 : 0.2}
            className="absolute inset-0"
          />
        </WebGLGuard>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <SpeakerWaveform speakers={active} />
        </div>
      </div>

      <StaggerGroup className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <StaggerItem>
          <MicControl
            micOn={listen.active}
            onToggle={(on) => listen.toggle(on)}
            levels={listen.levels}
          />
        </StaggerItem>
        <StaggerItem>
          <ListenControl
            listening={listen.active}
            onToggle={(on) => listen.toggle(on)}
            volume={75}
            onVolume={listen.setVolume}
          />
        </StaggerItem>
      </StaggerGroup>

      {/* Tabs */}
      <div className="flex gap-1 rounded-[var(--radius-r)] bg-[var(--color-surface-2)] p-1">
        {(["stage", "activity"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "flex items-center gap-1.5 rounded-[var(--radius-r-control)] px-3 py-1.5 text-xs font-medium transition-colors",
              tab === t
                ? "bg-[var(--color-signal)] text-[var(--color-signal-ink)]"
                : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]",
            )}
          >
            {t === "stage" ? (
              <Activity className="size-3.5" />
            ) : (
              <Headphones className="size-3.5" />
            )}
            {t === "stage" ? "Stage" : "Activity"}
          </button>
        ))}
      </div>

      {tab === "stage" && <ActiveSpeakersPanel speakers={speakers} />}
      {tab === "activity" && (
        <div className="surface p-4">
          <h3 className="mb-3 text-sm font-semibold">Live session timeline</h3>
          <SessionRibbon
            segments={speakers.map((s) => ({
              id: s.userId,
              label: s.username,
              value: s.speaking ? 3 : 1,
              tone: s.speaking ? "signal" : "neutral",
            }))}
          />
        </div>
      )}
    </div>
  );
}
