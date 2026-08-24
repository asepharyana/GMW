"use client";

/**
 * Voice scene — the stage node sits center; live speakers orbit it with
 * glow (published to the constellation). Controls float bottom-left,
 * connections whisper right, and the mic/listen meters stay docked.
 */
import {
  Headphones,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Volume2,
  Waves,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
import { Equalizer } from "@/components/charts";
import { Button, toast } from "@/components/primitives";
import { EmptyState, ErrorState } from "@/components/shared";
import { GuildChannelPicker } from "@/components/shared/guild-picker";
import {
  useSceneFocusSetter,
  useScenePublish,
} from "@/components/shell/scene-graph-context";
import { VoiceStage } from "@/components/voice/voice-stage";
import {
  useMicTransmit,
  useSpeakers,
  useVoiceConnect,
  useVoiceDisconnect,
  useVoiceListen,
  useVoiceStatus,
} from "@/hooks";
import type { ConstellationGraph } from "@/lib/constellation/graph";
import type { Guild, VoiceStatus } from "@/lib/types";
import { useWebSocket } from "@/lib/ws/context";

function speakerGraph(
  speakers: {
    userId: string;
    username: string;
    speaking: boolean;
    level?: number;
  }[],
): ConstellationGraph {
  return {
    nodes: [
      { id: "stage", label: "voice stage", kind: "guild", value: 1 },
      ...speakers.map((sp) => ({
        id: `speaker:${sp.userId}`,
        label: sp.username,
        kind: "speaker" as const,
        value: sp.speaking ? 0.8 : 0.4,
        href: undefined,
        meta: { speaking: sp.speaking },
      })),
    ],
    edges: speakers.map((sp) => ({
      source: "stage",
      target: `speaker:${sp.userId}`,
    })),
  };
}

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
  const publish = useScenePublish();
  const setFocus = useSceneFocusSetter();

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

  const graph = useMemo(() => speakerGraph(speakers), [speakers]);
  useEffect(() => {
    publish({ graph, focus: null });
  }, [graph, publish]);

  useEffect(
    () => () => {
      publish({ graph: { nodes: [], edges: [] }, focus: null });
      setFocus(null);
    },
    [publish, setFocus],
  );

  useEffect(() => {
    if (status?.connected) ambient.set("signal", 0.55, "voice live");
    else ambient.set("vermilion", 0.35, "voice idle");
  }, [status?.connected, ambient]);

  if (error && !status) return <ErrorState error={error} />;
  if (!status && isLoading)
    return (
      <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-mono text-sm text-[var(--color-ink-faint)]">
        menyetel ulang stage…
      </p>
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
    <div className="min-h-full">
      {/* Stage presence — top-center whisper */}
      <section
        className="pointer-events-none absolute inset-x-0 top-16 hidden justify-center md:flex"
        aria-label="Live speakers"
      >
        <div className="pointer-events-auto flex max-w-[60vw] flex-wrap justify-center gap-2">
          {speakers.length === 0 ? (
            <EmptyState
              icon={<MicOff className="size-6" />}
              title={connected ? "Silent right now" : "Not connected"}
              description={
                connected
                  ? "Speakers appear as they talk."
                  : "Connect to a voice channel to see presence."
              }
            />
          ) : (
            <VoiceStage speakers={speakers} />
          )}
        </div>
      </section>

      {/* Connections — right */}
      <section
        className="pointer-events-auto absolute right-5 top-16 hidden w-64 md:block"
        aria-label="Connections"
      >
        <p className="eyebrow mb-2">links · {speakers.length} present</p>
        <div className="space-y-1.5">
          {(status?.connections ?? []).map((c) => (
            <div
              key={`${c.guildId}-${c.channelId}`}
              className="flex items-center gap-2 rounded-full border border-[var(--color-hairline)] bg-[var(--color-canvas)]/55 px-3 py-1.5 font-mono text-xs text-[var(--color-ink-soft)] backdrop-blur-md"
            >
              <span className="size-2 rounded-full bg-signal" />
              <span className="flex-1 truncate">{c.channelName}</span>
              <span className="text-[var(--color-ink-faint)]">
                {new Date(c.connectedAt).toLocaleTimeString()}
              </span>
            </div>
          ))}
          {(status?.connections ?? []).length === 0 ? (
            <p className="font-mono text-xs text-[var(--color-ink-faint)]">
              no active links
            </p>
          ) : null}
          <p className="pt-1 font-mono text-xs text-[var(--color-ink-faint)]">
            channel: {status?.activeChannelName ?? "—"}
          </p>
        </div>
      </section>

      {/* Console — bottom-left */}
      <section
        className="pointer-events-auto absolute bottom-20 left-5 z-20 w-[min(24rem,92vw)] space-y-2.5 rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-canvas-2)]/75 p-3 backdrop-blur-xl lg:bottom-24"
        aria-label="Voice console"
      >
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
        </div>

        {micOn ? (
          <div
            className="flex items-center gap-2 px-1"
            role="status"
            aria-label="Microphone level meter"
          >
            <Mic className="size-3.5 text-signal" />
            <Equalizer bars={micBars} className="w-28" />
          </div>
        ) : null}
        {listen.active ? (
          <div className="flex items-center gap-2 px-1">
            <Waves className="size-3.5 text-signal" />
            <Equalizer bars={listenBars} className="w-40" />
          </div>
        ) : null}

        <div className="flex items-center gap-4 pt-1">
          <label className="flex items-center gap-2 font-mono text-xs text-[var(--color-ink-faint)]">
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
              className="h-1 w-20 cursor-pointer accent-[var(--color-signal)]"
            />
            <span className="w-8 text-right">{micVol}%</span>
          </label>
          <label className="flex items-center gap-2 font-mono text-xs text-[var(--color-ink-faint)]">
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
              className="h-1 w-20 cursor-pointer accent-[var(--color-signal)]"
            />
            <span className="w-8 text-right">{listenVol}%</span>
          </label>
        </div>
      </section>
    </div>
  );
}
