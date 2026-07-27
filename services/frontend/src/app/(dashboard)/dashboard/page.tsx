"use client";

import { BarChart3, Hash, Users } from "lucide-react";
import { useState } from "react";
import {
  ChannelDetailSection,
  ChannelsSection,
  StatsSection,
  UserDetailSection,
  UsersSection,
} from "@/components/dashboard";
import { GuildSelector } from "@/components/shared/guild-selector";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type View = "stats" | "users" | "channels" | "user-detail" | "channel-detail";

export default function DashboardPage() {
  const [view, setView] = useState<View>("stats");
  const [guildId, setGuildId] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    null,
  );

  return (
    <div className="space-y-5">
      <GuildSelector value={guildId} onChange={setGuildId} />

      <Tabs
        value={
          view === "user-detail"
            ? "users"
            : view === "channel-detail"
              ? "channels"
              : view
        }
        onValueChange={(v) => setView(v as View)}
      >
        <TabsList>
          <TabsTrigger value="stats" onClick={() => setView("stats")}>
            <BarChart3 className="size-4" /> Stats
          </TabsTrigger>
          <TabsTrigger value="users" onClick={() => setView("users")}>
            <Users className="size-4" /> Users
          </TabsTrigger>
          <TabsTrigger value="channels" onClick={() => setView("channels")}>
            <Hash className="size-4" /> Channels
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {view === "stats" && <StatsSection />}
      {view === "users" && (
        <UsersSection
          onSelect={(userId) => {
            setSelectedUserId(userId);
            setView("user-detail");
          }}
        />
      )}
      {view === "user-detail" && selectedUserId && (
        <UserDetailSection
          userId={selectedUserId}
          onBack={() => setView("users")}
        />
      )}
      {view === "channels" && (
        <ChannelsSection
          guildId={guildId}
          onSelect={(chId) => {
            setSelectedChannelId(chId);
            setView("channel-detail");
          }}
        />
      )}
      {view === "channel-detail" && selectedChannelId && (
        <ChannelDetailSection
          channelId={selectedChannelId}
          onBack={() => setView("channels")}
        />
      )}
    </div>
  );
}
