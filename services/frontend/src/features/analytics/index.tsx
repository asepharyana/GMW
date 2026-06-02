import { useState } from "react";
import { motion } from "framer-motion";
import { ActivityChart } from "./components/ActivityChart";
import { ControlBar } from "./components/ControlBar";
import { Heatmap } from "./components/Heatmap";
import { SummaryCards } from "./components/SummaryCards";
import { TopicList } from "./components/TopicList";
import { TrendChart } from "./components/TrendChart";
import { UserTable } from "./components/UserTable";
import { ViolatorTable } from "./components/ViolatorTable";
import { useAnalytics } from "./hooks/useAnalytics";
import { cardStagger, cardItem } from "../../shared/hooks/useFramerStagger";
import { EmptyStateMascot } from "../../widgets/mascot/ChibiMascot";

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
      <div className="rounded-2xl border border-red-300/40 bg-red-50/60 p-6 text-sm text-red-600 shadow-sm">
        {error}
      </div>
    );
  }

  if (!guildId) {
    return (
      <EmptyStateMascot variant="thinking" message="Menunggu konfigurasi guild..." />
    );
  }

  return (
    <motion.div
      className="flex flex-col gap-4"
      variants={cardStagger}
      initial="initial"
      animate="animate"
    >
      <motion.div variants={cardItem}>
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
      </motion.div>
      <motion.div variants={cardItem}>
        <SummaryCards
          messages={analyticsMessages}
          activeUsersCount={activeUsersCount}
          totalChannels={totalChannels}
          loading={loading}
        />
      </motion.div>
      <motion.div variants={cardItem}>
        <div className="grid grid-cols-3 gap-4">
          <ActivityChart hourly={hourly} loading={loading} />
          <div className="col-span-1">
            <TopicList topics={topics} loading={loading} />
          </div>
        </div>
      </motion.div>
      {hours >= 48 && (
        <motion.div variants={cardItem}>
          <TrendChart trend={trend} loading={loading} />
        </motion.div>
      )}
      <motion.div variants={cardItem}>
        <div className="grid grid-cols-3 gap-4">
          <Heatmap cells={heatmap} loading={loading} />
          <div className="col-span-1">
            <UserTable users={topUsers} loading={loading} />
          </div>
        </div>
      </motion.div>
      <motion.div variants={cardItem}>
        <ViolatorTable users={violators} loading={loading} />
      </motion.div>
    </motion.div>
  );
}
