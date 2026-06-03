import { Siren } from "lucide-react";
import type { ViolatorStat } from "../../../shared/api/client";
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

interface ViolatorTableProps {
  users: ViolatorStat[];
  loading: boolean;
}

export function ViolatorTable({ users, loading }: ViolatorTableProps) {
  if (loading && !users?.length) {
    return <LoadingBox />;
  }

  if (!users?.length) {
    return (
      <Card>
        <CardContent className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
          Tidak ada pelanggaran terdeteksi.
        </CardContent>
      </Card>
    );
  }

  const maxScore = Math.max(...users.map((u) => u.violation_score), 1);

  function dangerLabel(score: number) {
    if (score >= 10) return { variant: "destructive" as const, text: "HIGH" };
    if (score >= 5) return { variant: "warning" as const, text: "MED" };
    return { variant: "secondary" as const, text: "LOW" };
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Siren className="h-4 w-4 text-accent" />
              Pelanggar Terbanyak
            </CardTitle>
            <CardDescription className="text-xs">
              Skor: flagged × 3 + warned. Flag terbanyak terakhir ditampilkan.
            </CardDescription>
          </div>
          <Badge variant="destructive">{users.length} pelanggar</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="max-h-[320px]">
          <table className="w-full text-sm">
            <thead>
              <tr className="sticky top-0 z-10 bg-white border-b border-sky-100 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pl-4 pr-2 font-semibold">#</th>
                <th className="py-2 pr-2 font-semibold">User</th>
                <th className="py-2 pr-2 font-semibold text-right">Flagged</th>
                <th className="py-2 pr-2 font-semibold text-right">Warned</th>
                <th className="py-2 pr-2 font-semibold text-right">Skor</th>
                <th className="py-2 pr-4 font-semibold">Flag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sky-50">
              {users.map((user, i) => {
                const danger = dangerLabel(user.violation_score);
                return (
                  <tr
                    key={user.user_id}
                    className={cn(
                      "transition-colors border-l-2",
                      i % 2 === 0 ? "bg-white" : "bg-sky-50/20",
                      danger.variant === "destructive"
                        ? "border-l-accent/60"
                        : danger.variant === "warning"
                          ? "border-l-pink-300/60"
                          : "border-l-pink-200/40",
                    )}
                  >
                    <td className="py-1.5 pl-4 pr-2 font-mono text-[10px] text-muted-foreground tabular-nums">
                      {i + 1}
                    </td>
                    <td className="py-1.5 pr-2">
                      <div className="flex items-center gap-2">
                        {user.avatar_url ? (
                          <img
                            src={user.avatar_url}
                            alt=""
                            className="h-6 w-6 rounded-full ring-2 ring-pink-100"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-pink-100 text-[10px] font-bold text-accent">
                            {user.username.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="max-w-[100px] truncate text-xs font-medium">
                          {user.username}
                        </span>
                        <Badge
                          variant={danger.variant}
                          className="text-[9px] px-1 py-0"
                        >
                          {danger.text}
                        </Badge>
                      </div>
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono text-xs text-accent tabular-nums">
                      {user.flagged_count}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono text-xs text-yellow-600 tabular-nums">
                      {user.warned_count > 0 ? user.warned_count : "—"}
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="h-1.5 w-12 overflow-hidden rounded-full bg-pink-50">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              user.violation_score >= 10
                                ? "bg-gradient-to-r from-accent to-pink-400"
                                : user.violation_score >= 5
                                  ? "bg-gradient-to-r from-pink-400 to-pink-300"
                                  : "bg-gradient-to-r from-pink-300 to-pink-200",
                            )}
                            style={{
                              width: `${(user.violation_score / maxScore) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="font-mono text-xs font-bold tabular-nums">
                          {user.violation_score}
                        </span>
                      </div>
                    </td>
                    <td className="py-1.5 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {user.worst_flags?.length > 0 ? (
                          user.worst_flags.slice(0, 3).map((flag) => (
                            <Badge
                              key={flag}
                              variant="outline"
                              className="text-[8px] px-1 py-0 border-accent/30 text-accent"
                            >
                              {flag}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-[10px] text-muted-foreground">
                            —
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
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
