"use client";

import { Mic, PhoneOff, Radio, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
import { Button, GlassPanel, toast } from "@/components/primitives";
import {
  ErrorState,
  PageTransition,
  SectionHeader,
  SkeletonPanel,
} from "@/components/shared";
import { GuildChannelPicker } from "@/components/shared/guild-picker";
import { VoiceStage } from "@/components/voice/voice-stage";
import {
  useMicTransmit,
  useSpeakers,
  useVoiceConnect,
  useVoiceDisconnect,
  useVoiceListen,
  useVoiceStatus,
} from "@/hooks";
import { useStaggerReveal } from "@/hooks/use-gsap-animation";
import type { Guild, VoiceStatus } from "@/lib/types";
import { useWebSocket } from "@/lib/ws/context";

export function VoiceView({
  initialStatus,
  initialGuilds,
}: {
  initialStatus?: VoiceStatus;
  initialGuilds?: Guild[];
}) {
  const ws = useWebSocket();
  const {
    data: status,
    isLoading,
    error,
    mutate,
  } = useVoiceStatus(initialStatus);
  const connect = useVoiceConnect();
  const disconnect = useVoiceDisconnect();
  const mic = useMicTransmit(ws);
  const listen = useVoiceListen(ws);
  const { speakers, subscribe } = useSpeakers(initialStatus?.activeSpeakers);
  const ambient = useAmbient();

  const [guildId, setGuildId] = useState<string | null>(
    initialStatus?.activeGuildId ?? initialGuilds?.[0]?.id ?? null,
  );
  const [channelId, setChannelId] = useState<string | null>(
    initialStatus?.activeChannelId ?? null,
  );
  const [micVol, setMicVol] = useState(100);
  const [listenVol, setListenVol] = useState(75);

  const containerRef = useStaggerReveal<HTMLDivElement>(".voice-tile", {
    stagger: 0.04,
    y: 8,
    dependencies: [status],
  });

  useEffect(() => {
    const unsub = subscribe(ws);
    return unsub;
  }, [subscribe, ws]);

  useEffect(() => {
    if (status?.connected) ambient.set("signal", 0.45, "voice active");
    else ambient.set("vermilion", 0.25, "voice disconnected");
  }, [status?.connected, ambient]);

  if (error && !status)
    return <ErrorState error={error} onRetry={() => void mutate()} />;
  if (!status && isLoading)
    return (
      <div className="space-y-4">
        <SkeletonPanel rows={3} />
        <SkeletonPanel rows={5} />
      </div>
    );

  const connected = status?.connected ?? false;

  const onConnect = async () => {
    if (!guildId || !channelId) {
      toast({ title: "Select target channel", tone: "vermilion" });
      return;
    }
    try {
      await connect.mutateAsync({ guildId, channelId });
      toast({ title: "Connected to voice channel", tone: "signal" });
    } catch (e) {
      toast({
        title: "Connection failed",
        description: String(e),
        tone: "vermilion",
      });
    }
  };

  const onDisconnect = async () => {
    try {
      await disconnect.mutateAsync();
      toast({ title: "Disconnected from voice", tone: "neutral" });
    } catch (e) {
      toast({
        title: "Disconnect failed",
        description: String(e),
        tone: "vermilion",
      });
    }
  };

  return (
    <PageTransition>
      <div ref={containerRef} className="space-y-4">
        {/* Precision Sub-Header Bar */}
        <div className="voice-tile flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-3">
          <div className="flex items-center gap-2.5">
            <span
              className={`h-2 w-2 rounded-full ${
                connected
                  ? "bg-success shadow-[0_0_8px_var(--color-status-success)]"
                  : "bg-ink-muted"
              }`}
            />
            <h1 className="font-mono text-xs font-semibold tracking-wide text-ink uppercase">
              Voice Spectrum & Stage Controls
            </h1>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="text-ink-muted">STAGE:</span>
            <span
              className={`rounded px-1.5 py-0.5 font-medium border ${
                connected
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-hairline bg-surface-2 text-ink-muted"
              }`}
            >
              {connected ? "LIVE_BRIDGE" : "OFFLINE"}
            </span>
          </div>
        </div>

        {/* Channel Router Stage */}
        <div className="voice-tile">
          <GlassPanel className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex-1 min-w-[240px]">
                <GuildChannelPicker
                  guildId={guildId}
                  channelId={channelId}
                  guildsInitial={initialGuilds}
                  onChange={(g, c) => {
                    setGuildId(g);
                    setChannelId(c);
                  }}
                  mode="voice"
                />
              </div>
              <div className="flex items-center gap-2">
                {connected ? (
                  <Button
                    variant="danger"
                    size="md"
                    onClick={onDisconnect}
                    className="gap-1.5"
                  >
                    <PhoneOff className="size-3.5" />
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="md"
                    onClick={onConnect}
                    className="gap-1.5"
                  >
                    <Radio className="size-3.5" />
                    Connect Bridge
                  </Button>
                )}
              </div>
            </div>
          </GlassPanel>
        </div>

        {/* Voice Stage Grid */}
        <div className="grid gap-3 lg:grid-cols-3">
          <GlassPanel className="voice-tile lg:col-span-2">
            <SectionHeader
              eyebrow="Participants"
              title="Active Stage Members"
            />
            <div className="mt-4 min-h-[160px]">
              <VoiceStage speakers={speakers} />
            </div>
          </GlassPanel>

          <GlassPanel className="voice-tile flex flex-col justify-between">
            <div>
              <SectionHeader eyebrow="Telemetry" title="Input / Output Mix" />
              <div className="mt-4 space-y-4">
                <div>
                  <div className="flex justify-between text-xs font-medium text-ink-soft">
                    <span className="flex items-center gap-1.5">
                      <Mic className="size-3.5 text-signal" />
                      Mic Sensitivity
                    </span>
                    <span className="font-mono text-[11px] text-ink-muted">
                      {micVol}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={150}
                    value={micVol}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setMicVol(v);
                      mic.setVolume(v / 100);
                    }}
                    className="mt-2 h-1.5 w-full appearance-none rounded-full bg-surface-2 accent-signal"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-medium text-ink-soft">
                    <span className="flex items-center gap-1.5">
                      <Volume2 className="size-3.5 text-success" />
                      Monitor Output
                    </span>
                    <span className="font-mono text-[11px] text-ink-muted">
                      {listenVol}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={150}
                    value={listenVol}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setListenVol(v);
                      listen.setVolume(v / 100);
                    }}
                    className="mt-2 h-1.5 w-full appearance-none rounded-full bg-surface-2 accent-success"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 border-t border-hairline pt-3">
              <div className="font-mono text-[10px] text-ink-muted">
                CODEC: OPUS 48KHZ · LOW_LATENCY
              </div>
            </div>
          </GlassPanel>
        </div>
      </div>
    </PageTransition>
  );
}
