import { User } from "lucide-react";
import type { DashboardUserDetail } from "../../../shared/api/client";
import { ProfileDetail } from "../../../shared/ui";

interface UserProfileDetailProps {
  detail: DashboardUserDetail | null;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onRefetch: () => void;
}

export function UserProfileDetail({
  detail,
  loading,
  error,
  onBack,
  onRefetch,
}: UserProfileDetailProps) {
  if (!detail && !loading && !error) return null;

  const icon = detail?.avatar_url ? (
    <img
      src={detail.avatar_url}
      alt=""
      className="h-16 w-16 rounded-full object-cover ring-2 ring-border"
    />
  ) : (
    <User className="h-8 w-8" />
  );

  return (
    <ProfileDetail
      loading={loading}
      error={error}
      onRetry={onRefetch}
      onBack={onBack}
      icon={icon}
      title={detail?.username ?? detail?.user_id ?? ""}
      subtitle={detail?.user_id}
      summaryLabel="AI Profile Summary"
      summaryText={detail?.profile_summary ?? undefined}
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
