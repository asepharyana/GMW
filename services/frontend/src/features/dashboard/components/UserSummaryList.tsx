import { User } from "lucide-react";
import type { DashboardUser } from "../../../entities/dashboard/types.js";
import type { SummaryItem } from "../../../shared/ui";
import { SummaryList } from "../../../shared/ui";

interface UserSummaryListProps {
  users: DashboardUser[];
  loading: boolean;
  error: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  onRefetch: () => void;
  onSelectUser: (userId: string) => void;
}

export function UserSummaryList({
  users,
  loading,
  error,
  search,
  onSearchChange,
  onLoadMore,
  hasMore,
  onRefetch,
  onSelectUser,
}: UserSummaryListProps) {
  const items: SummaryItem[] = users.map((u) => ({
    id: u.user_id,
    label: u.username ?? u.user_id,
    subtitle: u.trust_score !== null ? `Trust: ${u.trust_score}` : undefined,
    summaryText: u.profile_summary ?? `${u.total_messages} messages`,
    onClick: () => onSelectUser(u.user_id),
  }));

  const avatarMap = new Map(users.map((u) => [u.user_id, u.avatar_url]));

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
      renderIcon={(item) => {
        const avatarUrl = avatarMap.get(item.id);
        return avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <User className="h-5 w-5 text-muted-foreground" />
          </div>
        );
      }}
      emptyMessage="No users found."
    />
  );
}
