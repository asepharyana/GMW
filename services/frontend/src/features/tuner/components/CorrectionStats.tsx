import { motion } from "framer-motion";
import { AlertCircle, RefreshCw } from "lucide-react";
import { useCorrectionStats } from "../hooks/useCorrections";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "../../../shared/ui";
import { EmptyStateMascot } from "../../../shared/ui";

function FlagsBar({
  flag,
  count,
  max,
}: {
  flag: string;
  count: number;
  max: number;
}) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-36 shrink-0 truncate text-sm font-medium capitalize text-muted-foreground">
        {flag.replace(/_/g, " ")}
      </span>
      <div className="flex-1">
        <div className="h-2.5 rounded-full bg-primary/10">
          <motion.div
            className="h-2.5 rounded-full bg-gradient-to-r from-primary to-blue-400"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
      </div>
      <span className="w-8 text-right text-sm font-bold text-foreground">
        {count}
      </span>
    </div>
  );
}

export function CorrectionStatsContent() {
  const { stats, loading, error, refetch } = useCorrectionStats();

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
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

  if (!stats || stats.total_corrections === 0) {
    return (
      <Card className="rounded-xl">
        <CardContent className="flex flex-col items-center py-12">
          <EmptyStateMascot />
          <p className="mt-4 text-sm text-muted-foreground text-center max-w-md">
            No corrections yet. When admins correct false positives, statistics
            will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={{
        initial: { opacity: 0 },
        animate: { transition: { staggerChildren: 0.1 } },
      }}
      className="space-y-4"
    >
      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <motion.div
          variants={{
            initial: { opacity: 0, y: 16 },
            animate: { opacity: 1, y: 0, transition: { duration: 0.4 } },
          }}
        >
          <Card className="rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Corrections
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">
                {stats.total_corrections}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          variants={{
            initial: { opacity: 0, y: 16 },
            animate: { opacity: 1, y: 0, transition: { duration: 0.4 } },
          }}
        >
          <Card className="rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Last 7 Days
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">
                {stats.recent_count_7d}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Flags bar chart */}
      {stats.by_flag.length > 0 && (
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Most Corrected Flags
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.by_flag.map((item) => (
              <FlagsBar
                key={item.flag}
                flag={item.flag}
                count={item.count}
                max={stats.by_flag[0].count}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
