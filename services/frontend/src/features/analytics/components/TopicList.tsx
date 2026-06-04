import { Flame } from "lucide-react";
import type { TopicTrend } from "../../../shared/api/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ScrollArea,
} from "../../../shared/ui";

interface TopicListProps {
  topics: TopicTrend[];
  loading: boolean;
}

const TOPIC_COLORS = [
  "from-primary to-sky-300",
  "from-accent to-pink-300",
  "from-orange-400 to-yellow-300",
  "from-emerald-400 to-teal-300",
  "from-violet-400 to-purple-300",
];

export function TopicList({ topics, loading }: TopicListProps) {
  if (loading && !topics?.length) return <LoadingBox />;
  if (!topics?.length) {
    return (
      <Card>
        <CardContent className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
          Topik akan muncul setelah AI selesai menganalisis.
        </CardContent>
      </Card>
    );
  }

  const maxCount = Math.max(...topics.map((t) => t.count), 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Flame className="h-4 w-4 text-primary" />
          Topik Trending
        </CardTitle>
        <CardDescription className="text-xs">
          Yang paling ramai dibicarakan.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="max-h-[260px]">
          <div className="divide-y divide-muted/30">
            {topics.map((topic, i) => {
              const colorClass =
                TOPIC_COLORS[i % TOPIC_COLORS.length];
              return (
                <div
                  key={topic.topic}
                  className="flex items-center gap-3 px-5 py-2.5 text-sm border-l-2"
                  style={{
                    borderLeftColor: `hsl(${199 + i * 35}, 80%, 50%)`,
                  }}
                >
                  <span className="w-5 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate font-medium text-xs">
                    {topic.topic}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-16 overflow-hidden rounded-md bg-muted/30">
                      <div
                        className={`h-full rounded-md bg-gradient-to-r ${colorClass}`}
                        style={{
                          width: `${(topic.count / maxCount) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="w-8 text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {topic.count}
                    </span>
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
