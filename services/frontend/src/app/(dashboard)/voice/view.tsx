"use client";

import {
  Mic,
  PhoneOff,
  Radio,
  ShieldCheck,
  ShieldOff,
  Volume2,
} from "lucide-react";
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
  const [micActive, setMicActive] = useState(false);
  const [listenActive, setListenActive] = useState(false);

  const toggleMic = async () => {
    const next = !micActive;
    try {
      await mic.mutateAsync(next);
      setMicActive(next);
      toast({
        title: next ? "Mic activated" : "Mic deactivated",
        tone: next ? "signal" : "neutral",
      });
    } catch (e) {
      // MicAccessError from mic-transmit.ts has specific reasons
      const msg = e instanceof Error ? e.message : String(e);
      const isPermDenied = msg.includes("denied") || msg.includes("Permission");
      const isNoMic = msg.includes("No microphone");
      toast({
        title: isPermDenied
          ? "Mic permission denied"
          : isNoMic
            ? "No microphone found"
            : "Mic toggle failed",
        description: msg,
        tone: "vermilion",
      });
    }
  };

  const toggleListen = () => {
    const next = !listenActive;
    listen.toggle(next);
    setListenActive(next);
    toast({
      title: next ? "Monitor activated" : "Monitor deactivated",
      tone: next ? "signal" : "neutral",
    });
  };

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
                {/* Mic Toggle */}
                <div>
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={toggleMic}
                      className={`flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-xs font-medium transition-all ${
                        micActive
                          ? "bg-signal/15 text-signal border border-signal/40 glow-pulse"
                          : "bg-surface-2 text-ink-muted border border-hairline hover:border-signal/30 hover:text-ink"
                      }`}
                    >
                      <Mic className="size-3.5" />
                      {micActive ? "MIC LIVE" : "MIC OFF"}
                    </button>
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
                  {/* Live mic level meter */}
                  {micActive && (
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-signal transition-all duration-100"
                        style={{
                          width: `${Math.min(100, mic.micLevel * 100)}%`,
                        }}
                      />
                    </div>
                  )}

                  {/* Noise Suppression Toggle */}
                  <div className="mt-2.5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const next = !mic.noiseSuppression;
                        mic.toggleNoiseSuppression(next);
                        toast({
                          title: next
                            ? "Noise suppression ON"
                            : "Noise suppression OFF",
                          tone: next ? "signal" : "neutral",
                        });
                      }}
                      className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-all ${
                        mic.noiseSuppression
                          ? "bg-success/15 text-success border border-success/30"
                          : "bg-surface-2 text-ink-faint border border-hairline hover:border-ink-muted/30"
                      }`}
                    >
                      {mic.noiseSuppression ? (
                        <ShieldCheck className="size-3" />
                      ) : (
                        <ShieldOff className="size-3" />
                      )}
                      NS {mic.noiseSuppression ? "ON" : "OFF"}
                    </button>
                    {micActive && (
                      <span className="font-mono text-[9px] text-ink-faint">
                        {mic.noiseSuppression ? "noise gated" : "raw audio"}
                      </span>
                    )}
                  </div>
                </div>

                {/* Listen Toggle */}
                <div>
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={toggleListen}
                      className={`flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-xs font-medium transition-all ${
                        listenActive
                          ? "bg-success/15 text-success border border-success/40 glow-pulse"
                          : "bg-surface-2 text-ink-muted border border-hairline hover:border-success/30 hover:text-ink"
                      }`}
                    >
                      <Volume2 className="size-3.5" />
                      {listenActive ? "MONITOR LIVE" : "MONITOR OFF"}
                    </button>
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
                  {/* Per-speaker level meters */}
                  {listenActive && listen.levels.size > 0 && (
                    <div className="mt-2 space-y-1">
                      {Array.from(listen.levels.entries()).map(
                        ([hash, level]) => (
                          <div key={hash} className="flex items-center gap-2">
                            <span className="font-mono text-[9px] text-ink-faint w-8">
                              #{hash.toString(16).slice(-3)}
                            </span>
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
                              <div
                                className="h-full rounded-full bg-success transition-all duration-100"
                                style={{
                                  width: `${Math.min(100, level * 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 border-t border-hairline pt-3">
              <div className="font-mono text-[10px] text-ink-muted">
                CODEC: OPUS 48KHZ · LOW_LATENCY
                {mic.noiseSuppression ? " · NS_ACTIVE" : ""}
              </div>
            </div>
          </GlassPanel>
        </div>
      </div>
    </PageTransition>
  );
}
