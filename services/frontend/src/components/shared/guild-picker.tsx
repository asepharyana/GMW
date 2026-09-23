"use client";

import { useEffect, useState } from "react";
import { Select, type SelectOption } from "@/components/primitives";
import { useGuilds, useTextChannels } from "@/hooks";
import type { Guild } from "@/lib/types";

export function GuildChannelPicker({
  guildsInitial,
  guildId,
  channelId,
  onChange,
}: {
  guildsInitial?: Guild[];
  guildId: string | null;
  channelId: string | null;
  onChange: (guildId: string, channelId: string | null) => void;
}) {
  const { data: guilds } = useGuilds(guildsInitial);
  const textChannels = useTextChannels(guildId ?? "");
  const channels = textChannels.data;

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
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
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
        className="w-full sm:w-44"
      />
      <Select
        value={c}
        onChange={(v) => {
          setC(v);
          if (g) onChange(g, v);
        }}
        options={channelOpts}
        placeholder="Text channel"
        size="sm"
        className="w-full sm:w-52"
      />
    </div>
  );
}
