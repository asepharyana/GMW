"use client";

import { Search, Users, UserX } from "lucide-react";
import { useCallback, useState } from "react";
import { EmptyState, LoadingSkeleton } from "@/components/shared";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useUserDetail, useUsers } from "@/hooks";
import { renderMessageContent } from "@/lib/format";
import type { DashboardUser } from "@/lib/types";
import { cn } from "@/lib/utils";

const TRUST_TIERS = [
  {
    min: 75,
    label: "Trusted",
    className: "border-green-500/40 text-green-500",
  },
  { min: 40, label: "Netral", className: "border-sky-500/40 text-sky-500" },
  {
    min: 10,
    label: "At Risk",
    className: "border-orange-500/40 text-orange-500",
  },
  { min: 0, label: "Kritis", className: "border-red-500/40 text-red-500" },
] as const;

export function trustTier(score: number) {
  return (
    TRUST_TIERS.find((t) => score >= t.min) ??
    TRUST_TIERS[TRUST_TIERS.length - 1]
  );
}

function TrustBadge({ score }: { score: number }) {
  const tier = trustTier(score);
  return (
    <Badge
      variant="outline"
      className={tier.className}
      title={`Trust score ${score}`}
    >
      {tier.label}: {score}
    </Badge>
  );
}

export function UsersSection() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const {
    data: users = [],
    isLoading,
    error,
    mutate: refetch,
  } = useUsers(search);
  const { data: detail } = useUserDetail(selectedId);

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    setSelectedId(null);
  }, []);

  if (error) {
    return (
      <Card
        className={cn(
          "p-6 text-sm",
          "border border-red-500/30 ring-red-500/20",
          "[--card-spacing:0px]",
          "rounded-2xl",
        )}
      >
        Failed to load users: {error.message}
        <Button
          variant="outline"
          size="sm"
          className="ml-2"
          onClick={() => refetch()}
        >
          Retry
        </Button>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by user ID or username…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {isLoading ? (
          <LoadingSkeleton count={5} height="h-16" />
        ) : users.length === 0 ? (
          <EmptyState icon={Users} title="No users found" />
        ) : (
          <div className="space-y-2">
            {users.map((user) => (
              <UserRow
                key={user.user_id}
                user={user}
                active={selectedId === user.user_id}
                onSelect={setSelectedId}
              />
            ))}
          </div>
        )}
      </div>

      <Card
        className={cn("h-fit", "[--card-spacing:0px]", "rounded-2xl", "p-5")}
      >
        {detail ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Avatar className="size-10">
                <AvatarImage src={detail.avatar_url ?? undefined} />
                <AvatarFallback>
                  {detail.username?.charAt(0).toUpperCase() ?? "?"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary">
                  {detail.username ?? "Unknown user"}
                </p>
                <p className="text-[10px] font-mono text-text-secondary/50">
                  {detail.user_id}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline">Messages: {detail.total_messages}</Badge>
              <Badge variant="destructive">
                Flagged: {detail.flagged_count}
              </Badge>
              <Badge
                variant="outline"
                className="border-green-500/40 text-green-500"
              >
                Clean: {detail.clean_count}
              </Badge>
              {detail.trust_score != null && (
                <TrustBadge score={detail.trust_score} />
              )}
              {detail.clean_message_streak != null && (
                <Badge variant="outline">
                  Streak: {detail.clean_message_streak}
                </Badge>
              )}
              {detail.total_infractions != null && (
                <Badge variant="destructive">
                  Infractions: {detail.total_infractions}
                </Badge>
              )}
            </div>

            {detail.profile_summary && (
              <p className="text-xs leading-relaxed text-text-secondary">
                {detail.profile_summary}
              </p>
            )}

            {detail.recent_messages.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary/50">
                  Recent messages
                </p>
                {detail.recent_messages.slice(0, 5).map((msg) => (
                  <div
                    key={msg.id}
                    className="rounded-lg border border-border/40 bg-card/40 px-3 py-2"
                  >
                    <p className="text-xs leading-relaxed text-text-secondary line-clamp-2">
                      {renderMessageContent(msg.content, msg.metadata) ||
                        "(no text content)"}
                    </p>
                    <p className="mt-1 text-[10px] font-mono text-text-secondary/40">
                      {msg.channel_id?.slice(0, 8)} ·{" "}
                      {new Date(msg.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-48 flex-col items-center justify-center text-center">
            <UserX className="size-8 text-text-secondary/30 mb-2" />
            <p className="text-xs text-text-secondary/60">
              Select a user to see their profile, trust score and recent
              messages.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

function UserRow({
  user,
  active,
  onSelect,
}: {
  user: DashboardUser;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <Card
      className={active ? "border-primary/40 bg-primary/5" : undefined}
      onClick={() => onSelect(user.user_id)}
    >
      <CardContent className="flex cursor-pointer items-center gap-3 p-3">
        <Avatar className="size-8 shrink-0">
          <AvatarImage src={user.avatar_url ?? undefined} />
          <AvatarFallback className="text-xs">
            {user.username?.charAt(0).toUpperCase() ?? "?"}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">
            {user.username ?? "Unknown user"}
          </p>
          <p className="truncate text-[10px] font-mono text-text-secondary/50">
            {user.user_id}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Badge variant="outline">{user.total_messages}</Badge>
          {user.flagged_count > 0 && (
            <Badge variant="destructive">{user.flagged_count}</Badge>
          )}
          {user.trust_score != null && <TrustBadge score={user.trust_score} />}
        </div>
      </CardContent>
    </Card>
  );
}
