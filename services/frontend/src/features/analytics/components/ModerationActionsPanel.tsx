import type { ModerationActionRecord } from "../../../shared/api/client";
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

interface ModerationActionsPanelProps {
  actions: ModerationActionRecord[];
  loading: boolean;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  delete_message: {
    label: "Hapus Pesan",
    color: "bg-red-100 text-red-700 border-red-200",
  },
  warn_user: {
    label: "Peringatan",
    color: "bg-yellow-100 text-yellow-700 border-yellow-200",
  },
  mute_user: {
    label: "Mute",
    color: "bg-orange-100 text-orange-700 border-orange-200",
  },
  kick_user: {
    label: "Kick",
    color: "bg-pink-100 text-pink-700 border-pink-200",
  },
  ban_user: {
    label: "Ban",
    color: "bg-accent/20 text-accent border-accent/30",
  },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-gray-100 text-gray-600" },
  completed: { label: "Selesai", color: "bg-green-100 text-green-700" },
  executed: { label: "Tereksekusi", color: "bg-green-100 text-green-700" },
  failed: { label: "Gagal", color: "bg-red-100 text-red-700" },
};

export function ModerationActionsPanel({
  actions,
  loading,
}: ModerationActionsPanelProps) {
  if (loading && !actions?.length) return <LoadingBox />;
  if (!actions?.length) {
    return (
      <Card>
        <CardContent className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
          Belum ada aksi moderasi.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <span className="text-lg">🛡️</span>
              Aksi Moderasi
            </CardTitle>
            <CardDescription className="text-xs">
              Riwayat tindakan moderasi yang telah diambil.
            </CardDescription>
          </div>
          <Badge variant="secondary">{actions.length} aksi</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="max-h-[320px]">
          <div className="divide-y divide-muted/30">
            {actions.map((action) => {
              const actionStyle = ACTION_LABELS[action.action_type] ?? {
                label: action.action_type,
                color: "bg-gray-100 text-gray-600",
              };
              const statusStyle = STATUS_LABELS[action.status] ?? {
                label: action.status,
                color: "bg-gray-100 text-gray-600",
              };

              return (
                <div
                  key={action.id}
                  className="px-5 py-3 text-sm hover:bg-muted/10 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] px-1.5 py-0 font-semibold whitespace-nowrap border",
                          actionStyle.color,
                        )}
                      >
                        {actionStyle.label}
                      </Badge>
                      <span className="truncate text-xs font-medium text-foreground">
                        {action.username}
                      </span>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] px-1.5 py-0 shrink-0",
                        statusStyle.color,
                      )}
                    >
                      {statusStyle.label}
                    </Badge>
                  </div>
                  {action.reason && (
                    <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1 pl-1">
                      {action.reason}
                    </p>
                  )}
                  {action.error && (
                    <p className="mt-0.5 text-[10px] text-destructive pl-1">
                      Error: {action.error}
                    </p>
                  )}
                  <div className="mt-1 text-[10px] text-muted-foreground pl-1">
                    {new Date(action.created_at).toLocaleString("id-ID", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function LoadingBox() {
  return (
    <Card>
      <CardContent className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
        <span className="h-4 w-4 animate-spin rounded-sm border-2 border-current border-t-transparent" />
        <span className="ml-2">Memuat data...</span>
      </CardContent>
    </Card>
  );
}
