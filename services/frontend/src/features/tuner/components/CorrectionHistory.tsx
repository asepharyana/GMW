import { motion } from "framer-motion";
import { AlertCircle, ChevronDown, RefreshCw } from "lucide-react";
import { useCorrectionHistory } from "../hooks/useCorrections";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ScrollArea,
  Skeleton,
} from "../../../shared/ui";
import { formatDate } from "../../../shared/lib/utils";
import { EmptyStateMascot } from "../../../shared/ui";
import { cardStagger, cardItem } from "../../../shared/hooks/useFramerStagger";

function parseFlags(flags: string): string[] {
  try {
    return JSON.parse(flags) as string[];
  } catch {
    return [];
  }
}

function CorrectionRow({
  entry,
  index,
}: {
  entry: {
    id: string;
    created_at: number;
    original_flags: string;
    corrected_flags: string;
    content_snippet: string;
    correction_notes: string | null;
  };
  index: number;
}) {
  const originalFlags = parseFlags(entry.original_flags);
  const correctedFlags = parseFlags(entry.corrected_flags);
  const isCleared = correctedFlags.length === 0;

  return (
    <motion.tr
      variants={cardItem}
      className="border-b border-border/40 last:border-0 hover:bg-primary/5 transition-colors"
    >
      <td className="whitespace-nowrap py-3 pr-4 text-xs text-muted-foreground">
        {formatDate(entry.created_at)}
      </td>
      <td className="py-3 pr-4">
        <div className="flex flex-wrap gap-1">
          {originalFlags.map((f) => (
            <Badge
              key={f}
              variant="destructive"
              className="text-[10px] capitalize"
            >
              {f.replace(/_/g, " ")}
            </Badge>
          ))}
        </div>
      </td>
      <td className="py-3 pr-4">
        {isCleared ? (
          <Badge
            variant="success"
            className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-200"
          >
            Cleared
          </Badge>
        ) : (
          <div className="flex flex-wrap gap-1">
            {correctedFlags.map((f) => (
              <Badge
                key={f}
                variant="outline"
                className="text-[10px] capitalize"
              >
                {f.replace(/_/g, " ")}
              </Badge>
            ))}
          </div>
        )}
      </td>
      <td className="max-w-[200px] truncate py-3 pr-4 text-sm text-muted-foreground">
        {entry.content_snippet}
      </td>
      <td className="max-w-[150px] truncate py-3 text-xs text-muted-foreground">
        {entry.correction_notes || "—"}
      </td>
    </motion.tr>
  );
}

export function CorrectionHistoryContent() {
  const { entries, loading, loadingMore, error, hasMore, loadMore, refetch } =
    useCorrectionHistory();

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-12 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="rounded-xl border-red-200 bg-red-50">
        <CardContent className="flex items-center gap-3 py-6">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
          <p className="flex-1 text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={refetch}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  if (entries.length === 0) {
    return (
      <Card className="rounded-xl">
        <CardContent className="flex flex-col items-center py-12">
          <EmptyStateMascot />
          <p className="mt-4 text-sm text-muted-foreground text-center max-w-md">
            No corrections submitted yet. Use the Submit tab to record your
            first correction.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Correction History
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="max-h-[60vh]">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/40 text-left text-xs font-medium text-muted-foreground">
                <th className="whitespace-nowrap px-4 py-3">Date</th>
                <th className="px-4 py-3">Original</th>
                <th className="px-4 py-3">Corrected</th>
                <th className="px-4 py-3">Content</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <CorrectionRow key={entry.id} entry={entry} index={i} />
              ))}
            </tbody>
          </table>
        </ScrollArea>

        {hasMore && (
          <div className="flex justify-center border-t border-border/40 px-4 py-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadMore}
              disabled={loadingMore}
              className="gap-1.5 text-xs"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${loadingMore ? "animate-bounce" : ""}`}
              />
              {loadingMore ? "Loading..." : "Load More"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
