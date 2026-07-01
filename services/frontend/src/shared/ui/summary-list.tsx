import { ChevronRight, Loader2, RefreshCw, Search } from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "../lib/utils";
import { Card, CardContent } from "./card";
import { Input } from "./input";
import { Skeleton } from "./skeleton";

export interface SummaryItem {
  id: string;
  label: string;
  subtitle?: string;
  summaryText: string;
  summaryValue?: number;
  onClick: () => void;
}

interface SummaryListProps<T extends SummaryItem> {
  items: T[];
  loading: boolean;
  error: string | null;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onRetry: () => void;
  hasMore: boolean;
  onLoadMore: () => void;
  loadingMore: boolean;
  renderIcon: (item: T) => ReactNode;
  emptyMessage?: string;
  className?: string;
}

export function SummaryList<T extends SummaryItem>({
  items,
  loading,
  error,
  searchValue,
  onSearchChange,
  onRetry,
  hasMore,
  onLoadMore,
  loadingMore,
  renderIcon,
  emptyMessage = "No items found",
  className,
}: SummaryListProps<T>) {
  return (
    <div className={cn("space-y-4", className)}>
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search..."
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 rounded-full"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex flex-col items-center gap-4 py-20 text-muted-foreground">
          <p className="text-sm">{error}</p>
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      )}

      {/* Loading skeleton — only on initial load */}
      {loading && items.length === 0 && !error && (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && items.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-20 text-muted-foreground">
          <p className="text-sm">{emptyMessage}</p>
        </div>
      )}

      {/* Items */}
      {!error && items.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={item.onClick}
                className="text-left w-full"
                aria-label={item.label}
              >
                <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0 text-muted-foreground">
                        {renderIcon(item)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-sm truncate">
                          {item.label}
                        </h3>
                        {item.subtitle && (
                          <p className="text-xs text-muted-foreground truncate">
                            {item.subtitle}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {item.summaryText}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-1" />
                    </div>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>

          {/* Load More */}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                onClick={onLoadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-xl border border-border px-6 py-2 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
              >
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                Load More
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
