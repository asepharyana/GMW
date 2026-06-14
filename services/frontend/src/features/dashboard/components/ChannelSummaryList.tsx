import { Hash } from "lucide-react";
import type { DashboardChannel } from "../../../shared/api/client";
import type { SummaryItem } from "../../../shared/ui";
import { SummaryList } from "../../../shared/ui";

interface ChannelSummaryListProps {
  channels: DashboardChannel[];
  loading: boolean;
  error: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  onRefetch: () => void;
  onSelectChannel: (channelId: string) => void;
}

export function ChannelSummaryList({
  channels,
  loading,
  error,
  search,
  onSearchChange,
  onLoadMore,
  hasMore,
  onRefetch,
  onSelectChannel,
}: ChannelSummaryListProps) {
  const items: SummaryItem[] = channels.map((ch) => ({
    id: ch.channel_id,
    label: `#${ch.channel_name ?? ch.channel_id}`,
    subtitle: ch.flagged_count > 0 ? `${ch.flagged_count} flagged` : undefined,
    summaryText: ch.culture_summary ?? `${ch.total_messages} messages`,
    onClick: () => onSelectChannel(ch.channel_id),
  }));

  return (
    <SummaryList
      items={items}
      loading={loading}
      error={error}
      searchValue={search}
      onSearchChange={onSearchChange}
      onRetry={onRefetch}
      hasMore={hasMore}
      onLoadMore={onLoadMore}
      loadingMore={loading}
      renderIcon={() => (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Hash className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      emptyMessage="No channels found."
    />
  );
}
