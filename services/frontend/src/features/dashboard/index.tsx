/* ═══════════════════════════════════════════════════════════════════════════
 * IMPHNEN DashboardPanel — Statistics Hub for Guild Moderation Watcher
 * Menampilkan overview komunitas dengan IMPHNEN approachable modernism.
 * Tiga tab: Stats (ringkasan), Users (profil pengguna), Channels (kanal).
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useState } from "react";
import {
  BarChart3,
  Hash,
  Users,
} from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../shared/ui";
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
    <div className="w-full">
      {/* ── Page Header ───────────────────────────────────────────────── */}
      <div className="mb-6">
        <h2 className="typo-headline-md text-[#1a1a1a]">
          Dashboard Guild
        </h2>
        <p className="typo-body-md text-[#666666] mt-1">
          Pantau statistik, profil pengguna, dan aktivitas kanal komunitas
          IMPHNEN secara real-time.
        </p>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6 bg-[#f5f5f5] p-1 rounded-lg inline-flex">
          <TabsTrigger value="stats" className="flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4" />
            <span>Statistik</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            <span>Pengguna</span>
          </TabsTrigger>
          <TabsTrigger value="channels" className="flex items-center gap-1.5">
            <Hash className="h-4 w-4" />
            <span>Kanal</span>
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
      </Tabs>
    </div>
  );
}
