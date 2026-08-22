"use client";

import {
  Headphones,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Volume2,
  Waves,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
import { Equalizer } from "@/components/charts";
import { Button, GlassPanel, toast } from "@/components/primitives";
import {
  EmptyState,
  ErrorState,
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
  const { data: status, isLoading, error } = useVoiceStatus(initialStatus);
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
  const [micOn, setMicOn] = useState(false);
  const [micVol, setMicVol] = useState(100);
  const [listenVol, setListenVol] = useState(75);

  useEffect(() => {
    const unsub = subscribe(ws);
    return unsub;
  }, [subscribe, ws]);

  useEffect(() => {
    if (status?.connected) ambient.set("signal", 0.55, "voice live");
    else ambient.set("vermilion", 0.35, "voice idle");
  }, [status?.connected, ambient]);

  if (error && !status) return <ErrorState error={error} />;
  if (!status && isLoading)
    return (
      <div className="space-y-5">
        <SkeletonPanel rows={2} />
        <div className="grid gap-5 lg:grid-cols-3">
          <SkeletonPanel className="lg:col-span-2" rows={4} />
          <SkeletonPanel rows={4} />
        </div>
      </div>
    );

  const connected = status?.connected ?? false;
  const listenBars = Array.from(listen.levels.values()).slice(0, 32);
  const micBars = mic.micLevel
    ? Array.from({ length: 12 }, (_, i) =>
        Math.max(
          0.08,
          Math.min(1, mic.micLevel * (1 - i * 0.06) + (i % 3) * 0.05),
        ),
      )
    : [];

  const onConnect = async () => {
    if (!guildId || !channelId) {
      toast({ title: "Pick a guild + channel", tone: "vermilion" });
      return;
    }
    try {
      await connect.mutateAsync({ guildId, channelId });
      toast({ title: "Connected to voice", tone: "signal" });
    } catch (e) {
      toast({
        title: "Connect failed",
        description: String(e),
        tone: "vermilion",
      });
    }
  };

  const onMic = async (on: boolean) => {
    try {
      await mic.mutateAsync(on);
      setMicOn(on);
    } catch (e) {
      toast({ title: "Mic error", description: String(e), tone: "vermilion" });
    }
  };

  return (
    <div className="space-y-5">
      <GlassPanel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <GuildChannelPicker
            mode="voice"
            guildsInitial={initialGuilds}
            guildId={guildId}
            channelId={channelId}
            onChange={(g, c) => {
              setGuildId(g);
              setChannelId(c);
            }}
          />
          <div className="flex items-center gap-2">
            {connected ? (
              <Button
                variant="danger"
                size="sm"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
              >
                <PhoneOff className="size-4" /> Disconnect
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={onConnect}
                disabled={connect.isPending}
              >
                <Radio className="size-4" /> Connect
              </Button>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant={micOn ? "primary" : "outline"}
            size="sm"
            onClick={() => onMic(!micOn)}
            disabled={mic.isPending}
            aria-pressed={micOn}
          >
            {micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
            {micOn ? "Mic live" : "Push-to-talk"}
          </Button>
          {micOn && (
            <div className="flex items-center gap-2 rounded-[10px] border border-signal/30 bg-signal/[0.06] px-3 py-1.5">
              <Mic className="size-4 text-signal" />
              <Equalizer
                bars={micBars}
                className="w-28"
                aria-label="Microphone level"
              />
            </div>
          )}
          <Button
            variant={listen.active ? "primary" : "outline"}
            size="sm"
            onClick={() => listen.toggle(!listen.active)}
          >
            {listen.active ? (
              <Headphones className="size-4" />
            ) : (
              <Volume2 className="size-4" />
            )}
            {listen.active ? "Listening" : "Listen in"}
          </Button>
          {listen.active && (
            <div className="flex items-center gap-2 rounded-[10px] border border-hairline bg-white/5 px-3 py-1.5">
              <Waves className="size-4 text-signal" />
              <Equalizer bars={listenBars} className="w-40" />
            </div>
          )}
          <div className="ml-auto flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-ink-faint">
              <MicOff className="size-3.5" />
              <input
                type="range"
                min={0}
                max={100}
                value={micVol}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setMicVol(v);
                  mic.setVolume(v);
                }}
                aria-label="Mic transmit volume"
                className="h-1 w-24 cursor-pointer accent-[var(--color-signal)]"
              />
              <span className="mono w-8 text-right">{micVol}%</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-ink-faint">
              <Volume2 className="size-3.5" />
              <input
                type="range"
                min={0}
                max={100}
                value={listenVol}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setListenVol(v);
                  listen.setVolume(v);
                }}
                aria-label="Listen volume"
                className="h-1 w-24 cursor-pointer accent-[var(--color-signal)]"
              />
              <span className="mono w-8 text-right">{listenVol}%</span>
            </label>
          </div>
        </div>
      </GlassPanel>

      <div className="grid gap-5 lg:grid-cols-3">
        <GlassPanel className="lg:col-span-2">
          <SectionHeader
            eyebrow="stage"
            title="Live speakers"
            action={
              <span className="mono text-xs text-ink-faint">
                {speakers.length} present
              </span>
            }
          />
          {speakers.length === 0 ? (
            <EmptyState
              icon={<MicOff className="size-7" />}
              title={connected ? "Silent right now" : "Not connected"}
              description={
                connected
                  ? "Speakers appear as they talk."
                  : "Connect to a voice channel to see presence."
              }
            />
          ) : (
            <>
              <VoiceStage speakers={speakers} />
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {speakers.map((sp) => (
                  <span
                    key={sp.userId}
                    className={`mono flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                      sp.speaking
                        ? "border-signal/40 bg-signal/10 text-signal"
                        : "border-hairline bg-white/5 text-ink-soft"
                    }`}
                  >
                    <span
                      className={`size-1.5 rounded-full ${sp.speaking ? "bg-signal animate-breathe" : "bg-ink-faint"}`}
                    />
                    {sp.username}
                  </span>
                ))}
              </div>
            </>
          )}
        </GlassPanel>

        <GlassPanel>
          <SectionHeader eyebrow="links" title="Connections" />
          <div className="space-y-2">
            {(status?.connections ?? []).map((c) => (
              <div
                key={`${c.guildId}-${c.channelId}`}
                className="flex items-center gap-2 rounded-[10px] border border-hairline bg-white/5 px-3 py-2 text-sm"
              >
                <span className="size-2 rounded-full bg-signal" />
                <span className="flex-1 truncate text-ink-soft">
                  {c.channelName}
                </span>
                <span className="mono text-[0.6rem] text-ink-faint">
                  {new Date(c.connectedAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
            {(status?.connections ?? []).length === 0 && (
              <div className="py-6 text-center text-xs text-ink-faint">
                No active links
              </div>
            )}
          </div>
          <div className="mt-3 rounded-[10px] border border-hairline bg-white/5 px-3 py-2 text-xs text-ink-soft">
            <span className="mono text-ink-faint">channel</span>{" "}
            {status?.activeChannelName ?? "—"}
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
