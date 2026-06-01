import { useState } from "react";
import type { Channel, Guild } from "../../shared/api/client";
import { useAnalytics } from "./hooks/useAnalytics";
import { ControlBar } from "./components/ControlBar";
import { SummaryCards } from "./components/SummaryCards";
import { ActivityChart } from "./components/ActivityChart";
import { TrendChart } from "./components/TrendChart";
import { Heatmap } from "./components/Heatmap";
import { TopicList } from "./components/TopicList";
import { UserTable } from "./components/UserTable";
import { ViolatorTable } from "./components/ViolatorTable";

interface AnalyticsPanelProps {
  guilds: Guild[];
  channels: Channel[];
  selectedGuild: string;
  selectedChannel: string;
  onGuildChange: (guildId: string) => void;
  onChannelChange: (channelId: string) => void;
}

export function AnalyticsPanel({
  guilds, channels, selectedGuild, selectedChannel,
  onGuildChange, onChannelChange,
}: AnalyticsPanelProps) {
  const [hours, setHours] = useState(24);
  const analytics = useAnalytics({ guildId: selectedGuild, channelId: selectedChannel || undefined, hours });

  const { hourly, topics, topUsers, activeUsersCount, totalChannels, violators, trend, heatmap, isLoading, isFetching, error, refresh, refreshViolators, messages: analyticsMessages } = analytics;
  const loading = isLoading && !isFetching;

  if (error && !analyticsMessages) {
    return <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">{error}</div>;
  }

  if (!selectedGuild) {
    return <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8"><p className="text-sm text-muted-foreground">Pilih guild untuk melihat analitik.</p></div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <ControlBar guilds={guilds} channels={channels} selectedGuild={selectedGuild} selectedChannel={selectedChannel} hours={hours} isFetching={isFetching} onGuildChange={onGuildChange} onChannelChange={onChannelChange} onHoursChange={setHours} onRefresh={() => { refresh(); refreshViolators(); }} />
      <SummaryCards messages={analyticsMessages} activeUsersCount={activeUsersCount} totalChannels={totalChannels} loading={loading} />
      <div className="grid grid-cols-3 gap-4">
        <ActivityChart hourly={hourly} loading={loading} />
        <div className="col-span-1"><TopicList topics={topics} loading={loading} /></div>
      </div>
      {hours >= 48 && <TrendChart trend={trend} loading={loading} />}
      <div className="grid grid-cols-3 gap-4">
        <Heatmap cells={heatmap} loading={loading} />
        <div className="col-span-1"><UserTable users={topUsers} loading={loading} /></div>
      </div>
      <ViolatorTable users={violators} loading={loading} />
    </div>
  );
}
