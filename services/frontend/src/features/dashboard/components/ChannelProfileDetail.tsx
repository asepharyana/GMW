import { Hash } from "lucide-react";
import type { DashboardChannelDetail } from "../../../entities/dashboard/types.js";
import { ProfileDetail } from "../../../shared/ui";

interface ChannelProfileDetailProps {
  detail: DashboardChannelDetail | null;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onRefetch: () => void;
}

export function ChannelProfileDetail({
  detail,
  loading,
  error,
  onBack,
  onRefetch,
}: ChannelProfileDetailProps) {
  if (!detail && !loading && !error) return null;

  return (
    <ProfileDetail
      loading={loading}
      error={error}
      onRetry={onRefetch}
      onBack={onBack}
      icon={<Hash className="h-8 w-8" />}
      title={detail ? `#${detail.channel_name ?? detail.channel_id}` : ""}
      subtitle={detail?.channel_id}
      summaryLabel="AI Channel Summary"
      summaryText={detail?.culture_summary ?? undefined}
      lastAnalyzedLabel={
        detail?.last_analyzed_at
          ? `Last analyzed: ${new Date(detail.last_analyzed_at).toLocaleString()}`
          : undefined
      }
      stats={{
        totalLabel: "Total Messages",
        totalValue: detail?.total_messages ?? 0,
        cleanLabel: "Clean",
        cleanValue: detail?.clean_count ?? 0,
        flaggedLabel: "Flagged",
        flaggedValue: detail?.flagged_count ?? 0,
      }}
      messages={
        detail?.recent_messages.map((msg) => ({
          id: msg.id,
          content: msg.content,
          created_at: new Date(msg.created_at).toISOString(),
          ai_status: msg.ai_status,
        })) ?? []
      }
    />
  );
}
