import { Settings } from "lucide-react";
import { useState } from "react";
import { AdminPanel } from "../../features/admin/AdminPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../shared/ui";
import { ChannelProfileDetail } from "./components/ChannelProfileDetail";
import { ChannelSummaryList } from "./components/ChannelSummaryList";
import { DashboardStatsContent } from "./components/DashboardStats";
import { UserProfileDetail } from "./components/UserProfileDetail";
import { UserSummaryList } from "./components/UserSummaryList";
import {
  useDashboardChannelDetail,
  useDashboardChannels,
  useDashboardUserDetail,
  useDashboardUsers,
} from "./hooks/useDashboard";

export function DashboardPanel() {
  const [activeTab, setActiveTab] = useState("stats");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    null,
  );
  const {
    users,
    loading: usersLoading,
    error: usersError,
    search: userSearch,
    setSearch: setUserSearch,
    loadMore: loadMoreUsers,
    hasMore: hasMoreUsers,
    refetch: refetchUsers,
  } = useDashboardUsers();
  const {
    detail: userDetail,
    loading: userDetailLoading,
    error: userDetailError,
    refetch: refetchUserDetail,
  } = useDashboardUserDetail(selectedUserId);
  const {
    channels,
    loading: channelsLoading,
    error: channelsError,
    search: channelSearch,
    setSearch: setChannelSearch,
    loadMore: loadMoreChannels,
    hasMore: hasMoreChannels,
    refetch: refetchChannels,
  } = useDashboardChannels();
  const {
    detail: channelDetail,
    loading: channelDetailLoading,
    error: channelDetailError,
    refetch: refetchChannelDetail,
  } = useDashboardChannelDetail(selectedChannelId);

  // Show user detail view
  if (selectedUserId) {
    return (
      <UserProfileDetail
        detail={userDetail}
        loading={userDetailLoading}
        error={userDetailError}
        onBack={() => {
          setSelectedUserId(null);
        }}
        onRefetch={refetchUserDetail}
      />
    );
  }

  // Show channel detail view
  if (selectedChannelId) {
    return (
      <ChannelProfileDetail
        detail={channelDetail}
        loading={channelDetailLoading}
        error={channelDetailError}
        onBack={() => {
          setSelectedChannelId(null);
        }}
        onRefetch={refetchChannelDetail}
      />
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="mb-6">
        <TabsTrigger value="stats">Stats</TabsTrigger>
        <TabsTrigger value="users">Users</TabsTrigger>
        <TabsTrigger value="channels">Channels</TabsTrigger>
        <TabsTrigger value="admin" className="flex items-center gap-1.5">
          <Settings className="h-3.5 w-3.5" />
          Admin
        </TabsTrigger>
      </TabsList>

      <TabsContent value="stats">
        <DashboardStatsContent />
      </TabsContent>

      <TabsContent value="users">
        <UserSummaryList
          users={users}
          loading={usersLoading}
          error={usersError}
          search={userSearch}
          onSearchChange={setUserSearch}
          onLoadMore={loadMoreUsers}
          hasMore={hasMoreUsers}
          onRefetch={refetchUsers}
          onSelectUser={setSelectedUserId}
        />
      </TabsContent>

      <TabsContent value="channels">
        <ChannelSummaryList
          channels={channels}
          loading={channelsLoading}
          error={channelsError}
          search={channelSearch}
          onSearchChange={setChannelSearch}
          onLoadMore={loadMoreChannels}
          hasMore={hasMoreChannels}
          onRefetch={refetchChannels}
          onSelectChannel={setSelectedChannelId}
        />
      </TabsContent>

      <TabsContent value="admin">
        <AdminPanel />
      </TabsContent>
    </Tabs>
  );
}
