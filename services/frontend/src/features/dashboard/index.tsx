import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../shared/ui";
import { DashboardStatsContent } from "./components/DashboardStats";
import { UserProfileDetail } from "./components/UserProfileDetail";
import { UserSummaryList } from "./components/UserSummaryList";
import {
  useDashboardUserDetail,
  useDashboardUsers,
} from "./hooks/useDashboard";

export function DashboardPanel() {
  const [activeTab, setActiveTab] = useState("stats");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const {
    users,
    loading: usersLoading,
    error: usersError,
    search,
    setSearch,
    loadMore,
    hasMore,
    refetch: refetchUsers,
  } = useDashboardUsers();
  const {
    detail,
    loading: detailLoading,
    error: detailError,
    refetch: refetchDetail,
  } = useDashboardUserDetail(selectedUserId);

  // Show user detail view
  if (selectedUserId) {
    return (
      <UserProfileDetail
        detail={detail}
        loading={detailLoading}
        error={detailError}
        onBack={() => {
          setSelectedUserId(null);
        }}
        onRefetch={refetchDetail}
      />
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="mb-6">
        <TabsTrigger value="stats">Stats</TabsTrigger>
        <TabsTrigger value="users">Users</TabsTrigger>
      </TabsList>

      <TabsContent value="stats">
        <DashboardStatsContent />
      </TabsContent>

      <TabsContent value="users">
        <UserSummaryList
          users={users}
          loading={usersLoading}
          error={usersError}
          search={search}
          onSearchChange={setSearch}
          onLoadMore={loadMore}
          hasMore={hasMore}
          onRefetch={refetchUsers}
          onSelectUser={setSelectedUserId}
        />
      </TabsContent>
    </Tabs>
  );
}
