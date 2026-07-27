"use client";

import { ChevronRight, Search, Users } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { EmptyState, LoadingSkeleton } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useUsers } from "@/hooks";

export function UsersSection({ onSelect }: { onSelect: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const { data: users, isLoading } = useUsers(search || undefined);

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search users…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>
      {isLoading ? (
        <LoadingSkeleton count={6} height="h-20" columns={2} />
      ) : !users || users.length === 0 ? (
        <EmptyState icon={Users} title="No users found." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {users.map((u) => (
            <Card
              key={u.user_id}
              className="cursor-pointer hover:bg-accent/5 transition-colors"
              onClick={() => onSelect(u.user_id)}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="size-10 shrink-0 rounded-full bg-muted flex items-center justify-center text-sm font-medium overflow-hidden ring-1 ring-border">
                    {u.avatar_url ? (
                      <Image
                        src={u.avatar_url}
                        alt=""
                        width={40}
                        height={40}
                        className="size-full object-cover"
                      />
                    ) : (
                      (u.username ?? "?").charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {u.username ?? "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>{u.total_messages} messages</span>
                      {u.flagged_count > 0 && (
                        <Badge
                          variant="destructive"
                          className="text-[10px] px-1.5 py-0 h-4"
                        >
                          {u.flagged_count} flagged
                        </Badge>
                      )}
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
