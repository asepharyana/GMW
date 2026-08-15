"use client";

import { useEffect, useState } from "react";
import { useGuilds, useTextChannels, useVoiceChannels } from "@/hooks";
import { Select, type SelectOption } from "@/components/primitives";
import type { Guild } from "@/lib/types";

export function GuildChannelPicker({
  mode,
  guildsInitial,
  guildId,
  channelId,
  onChange,
}: {
  mode: "voice" | "text";
  guildsInitial?: Guild[];
  guildId: string | null;
  channelId: string | null;
  onChange: (guildId: string, channelId: string | null) => void;
}) {
  const { data: guilds } = useGuilds(guildsInitial);
  // Call both hooks unconditionally (rules of hooks); select by mode.
  const voiceChannels = useVoiceChannels(guildId ?? "");
  const textChannels = useTextChannels(guildId ?? "");
  const channels = mode === "voice" ? voiceChannels.data : textChannels.data;

  const [g, setG] = useState(guildId);
  const [c, setC] = useState(channelId);

  useEffect(() => setG(guildId), [guildId]);
  useEffect(() => setC(channelId), [channelId]);

  const guildOpts: SelectOption[] = (guilds ?? []).map((x) => ({
    value: x.id,
    label: x.name,
  }));
  const channelOpts: SelectOption[] = (channels ?? []).map((x) => ({
    value: x.id,
    label: x.name,
    hint: x.type,
  }));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={g}
        onChange={(v) => {
          setG(v);
          setC(null);
          onChange(v, null);
        }}
        options={guildOpts}
        placeholder="Guild"
        size="sm"
        className="w-44"
      />
      <Select
        value={c}
        onChange={(v) => {
          setC(v);
          if (g) onChange(g, v);
        }}
        options={channelOpts}
        placeholder={mode === "voice" ? "Voice channel" : "Text channel"}
        size="sm"
        className="w-52"
      />
    </div>
  );
}
