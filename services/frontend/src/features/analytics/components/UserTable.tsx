import { Users } from "lucide-react";
import type { UserStat } from "../../../shared/api/client";
import { cn } from "../../../shared/lib/utils";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ScrollArea,
} from "../../../shared/ui";

interface UserTableProps {
  users: UserStat[];
  loading: boolean;
}

export function UserTable({ users, loading }: UserTableProps) {
  if (loading && !users?.length) {
    return <LoadingBox />;
  }

  if (!users?.length) {
    return (
      <Card>
        <CardContent className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
          Belum ada aktivitas user.
        </CardContent>
      </Card>
    );
  }

  const maxMsgs = Math.max(...users.map((u) => u.message_count), 1);
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4 text-primary" />
          User Paling Aktif
        </CardTitle>
        <CardDescription className="text-xs">
          Leaderboard berdasarkan jumlah pesan.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="max-h-[260px]">
          <table className="w-full text-sm">
            <thead>
              <tr className="sticky top-0 z-10 bg-white border-b border-sky-100 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pl-4 pr-2 font-semibold">#</th>
                <th className="py-2 pr-2 font-semibold">User</th>
                <th className="py-2 pr-2 font-semibold text-right">Pesan</th>
                <th className="py-2 pr-2 font-semibold text-right">Edit</th>
                <th className="py-2 pr-4 font-semibold text-right">Flag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sky-50">
              {users.map((user, i) => (
                <tr
                  key={user.user_id}
                  className={cn(
                    "transition-colors rounded-xl",
                    i % 2 === 0 ? "bg-white" : "bg-sky-50/20",
                  )}
                >
                  <td className="py-1.5 pl-4 pr-2 font-mono text-[10px] text-muted-foreground tabular-nums">
                    {medals[i] ?? i + 1}
                  </td>
                  <td className="py-1.5 pr-2">
                    <div className="flex items-center gap-2">
                      {user.avatar_url ? (
                        <img
                          src={user.avatar_url}
                          alt=""
                          className="h-6 w-6 rounded-full ring-2 ring-sky-100"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-100 text-[10px] font-bold text-primary">
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="max-w-[100px] truncate text-xs font-medium">
                        {user.username}
                      </span>
                    </div>
                  </td>
                  <td className="py-1.5 pr-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-sky-50">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-primary to-pink-300"
                          style={{
                            width: `${(user.message_count / maxMsgs) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="font-mono text-xs tabular-nums">
                        {user.message_count}
                      </span>
                    </div>
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono text-[10px] text-muted-foreground tabular-nums">
                    {user.edited_count > 0 ? user.edited_count : "—"}
                  </td>
                  <td className="py-1.5 pr-4 text-right">
                    {user.flagged_count > 0 ? (
                      <Badge
                        variant="destructive"
                        className="text-[9px] px-1 py-0"
                      >
                        {user.flagged_count}
                      </Badge>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">
                        —
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function LoadingBox() {
  return (
    <Card>
      <CardContent className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <span className="ml-2">Memuat data...</span>
      </CardContent>
    </Card>
  );
}
