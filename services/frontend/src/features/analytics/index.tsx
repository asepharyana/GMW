import { useState } from "react";
import { ActivityChart } from "./components/ActivityChart";
import { ControlBar } from "./components/ControlBar";
import { Heatmap } from "./components/Heatmap";
import { SummaryCards } from "./components/SummaryCards";
import { TopicList } from "./components/TopicList";
import { TrendChart } from "./components/TrendChart";
import { UserTable } from "./components/UserTable";
import { ViolatorTable } from "./components/ViolatorTable";
import { useAnalytics } from "./hooks/useAnalytics";

interface AnalyticsPanelProps {
  guildId: string;
  guildName: string | null;
}

export function AnalyticsPanel({ guildId, guildName }: AnalyticsPanelProps) {
  const [hours, setHours] = useState(24);
  const analytics = useAnalytics({
    guildId,
    // No channelId — analytics for all channels in the guild
    channelId: undefined,
    hours,
  });

  const {
    hourly,
    topics,
    topUsers,
    activeUsersCount,
    totalChannels,
    violators,
    trend,
    heatmap,
    isLoading,
    isFetching,
    error,
    refresh,
    refreshViolators,
    messages: analyticsMessages,
  } = analytics;
  const loading = isLoading && !isFetching;

  if (error && !analyticsMessages) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
        {error}
      </div>
    );
  }

  if (!guildId) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8">
        <p className="text-sm text-muted-foreground">
          Menunggu konfigurasi guild...
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ControlBar
        guildName={guildName}
        hours={hours}
        isFetching={isFetching}
        onHoursChange={setHours}
        onRefresh={() => {
          refresh();
          refreshViolators();
        }}
      />
      <SummaryCards
        messages={analyticsMessages}
        activeUsersCount={activeUsersCount}
        totalChannels={totalChannels}
        loading={loading}
      />
      <div className="grid grid-cols-3 gap-4">
        <ActivityChart hourly={hourly} loading={loading} />
        <div className="col-span-1">
          <TopicList topics={topics} loading={loading} />
        </div>
      </div>
      {hours >= 48 && <TrendChart trend={trend} loading={loading} />}
      <div className="grid grid-cols-3 gap-4">
        <Heatmap cells={heatmap} loading={loading} />
        <div className="col-span-1">
          <UserTable users={topUsers} loading={loading} />
        </div>
      </div>
      <ViolatorTable users={violators} loading={loading} />
    </div>
  );
}
