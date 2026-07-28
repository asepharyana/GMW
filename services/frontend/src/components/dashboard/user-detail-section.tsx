"use client";

import { ArrowLeft, Clock, Sparkles } from "lucide-react";
import Image from "next/image";

import { DetailStat, ErrorState, LoadingSkeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useUserDetail } from "@/hooks";

export function UserDetailSection({
  userId,
  onBack,
}: {
  userId: string;
  onBack: () => void;
}) {
  const { data: user, isLoading } = useUserDetail(userId);
  if (isLoading) return <LoadingSkeleton count={1} height="h-64" />;
  if (!user) return <ErrorState message="User not found." />;

  return (
    <div className="space-y-5 animate-fade-in-up">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="size-4 mr-1" /> Back
      </Button>
      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="flex items-center gap-4">
            <div className="size-14 shrink-0 rounded-full bg-muted flex items-center justify-center text-xl font-medium overflow-hidden ring-2 ring-border">
              {user.avatar_url ? (
                <Image
                  src={user.avatar_url}
                  alt=""
                  width={56}
                  height={56}
                  className="size-full object-cover"
                />
              ) : (
                (user.username ?? "?").charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">
                {user.username ?? "Unknown"}
              </h2>
              <p className="text-xs text-muted-foreground font-mono">
                {user.user_id}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <DetailStat label="Messages" value={user.total_messages} />
            <DetailStat
              label="Flagged"
              value={user.flagged_count}
              variant="danger"
            />
            <DetailStat
              label="Clean Streak"
              value={user.clean_message_streak ?? 0}
            />
            <DetailStat
              label="Trust Score"
              value={user.trust_score ?? 0}
              suffix="%"
            />
          </div>
          {user.profile_summary && (
            <div className="rounded-lg bg-gradient-to-br from-primary/5 to-primary/[0.02] border border-primary/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="size-4 text-primary" />
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  AI Profile
                </p>
              </div>
              <p className="text-sm leading-relaxed">{user.profile_summary}</p>
            </div>
          )}
          {user.recent_messages.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Clock className="size-4 text-muted-foreground" /> Recent
                Messages
              </h3>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {user.recent_messages.slice(0, 5).map((msg) => (
                  <div
                    key={msg.id}
                    className="rounded-lg border border-border/50 bg-muted/20 p-3 text-sm"
                  >
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-2">
                      <Clock className="size-3" />
                      {new Date(msg.created_at).toLocaleString()}
                    </p>
                    <p className="text-sm">{msg.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
