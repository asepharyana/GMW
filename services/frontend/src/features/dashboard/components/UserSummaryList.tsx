import { motion } from "framer-motion";
import { AlertCircle, Loader2, RefreshCw, Search, User } from "lucide-react";
import type { DashboardUser } from "../../../shared/api/client";
import { cardItem, cardStagger } from "../../../shared/hooks/useFramerStagger";
import { cn } from "../../../shared/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
} from "../../../shared/ui";

interface UserSummaryListProps {
  users: DashboardUser[];
  loading: boolean;
  error: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  onRefetch: () => void;
  onSelectUser: (userId: string) => void;
}

export function UserSummaryList({
  users,
  loading,
  error,
  search,
  onSearchChange,
  onLoadMore,
  hasMore,
  onRefetch,
  onSelectUser,
}: UserSummaryListProps) {
  return (
    <motion.div
      className="grid gap-6"
      variants={cardStagger}
      initial="initial"
      animate="animate"
    >
      {/* Search bar */}
      <motion.div variants={cardItem} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
          <Input
            className="pl-9 rounded-full focus-visible:ring-primary"
            placeholder="Search by username or user ID..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </motion.div>

      {/* Error state */}
      {error && (
        <motion.div
          variants={cardItem}
          className="flex flex-col items-center gap-4 py-10 text-muted-foreground"
        >
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-sm">{error}</p>
          <button
            onClick={onRefetch}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </motion.div>
      )}

      {/* Loading state */}
      {loading && users.length === 0 && !error && <UserListSkeleton />}

      {/* Empty state */}
      {!loading && !error && users.length === 0 && (
        <motion.div
          variants={cardItem}
          className="flex flex-col items-center gap-4 py-20 text-muted-foreground"
        >
          <User className="h-10 w-10" />
          <p className="text-sm">No users found.</p>
        </motion.div>
      )}

      {/* User cards */}
      {users.length > 0 && (
        <motion.div variants={cardItem} className="grid gap-3 sm:grid-cols-2">
          {users.map((u) => (
            <button
              key={u.user_id}
              onClick={() => onSelectUser(u.user_id)}
              className="group w-full text-left"
            >
              <Card className="transition-all hover:ring-1 hover:ring-primary/30 cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="shrink-0">
                      {u.avatar_url ? (
                        <img
                          src={u.avatar_url}
                          alt={u.username ?? "User"}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                          <User className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">
                          {u.username ?? u.user_id}
                        </span>
                        {u.trust_score !== null && (
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                              u.trust_score >= 80
                                ? "bg-emerald-100 text-emerald-700"
                                : u.trust_score >= 50
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-red-100 text-red-700",
                            )}
                          >
                            {u.trust_score}
                          </span>
                        )}
                      </div>

                      {u.profile_summary && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {u.profile_summary}
                        </p>
                      )}

                      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span>{u.total_messages} messages</span>
                        {u.flagged_count > 0 && (
                          <span className="text-destructive">
                            {u.flagged_count} flagged
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </button>
          ))}
        </motion.div>
      )}

      {/* Load more */}
      {hasMore && (
        <motion.div variants={cardItem} className="flex justify-center">
          <button
            onClick={onLoadMore}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-6 py-2 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Loading..." : "Load More"}
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}

function UserListSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
