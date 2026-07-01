import { motion } from "framer-motion";
import { Filter, RotateCw, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { MessageRecord } from "../../shared/api/client";
import { request } from "../../shared/api/client";
import { cardItem, cardStagger } from "../../shared/hooks/useFramerStagger";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../shared/ui";
import { ImageGrid } from "./components/ImageGrid";
import { MessageFeed } from "./components/MessageFeed";

interface MessagesPanelProps {
  guildName: string | null;
  messages: MessageRecord[];
  onReanalyze: (id: string) => Promise<void>;
  onReanalyzeAllErrors?: () => Promise<number>;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}

type AiFilter = "all" | "analyzed" | "clean" | "flagged" | "error" | "pending";

export function MessagesPanel({
  guildName,
  messages,
  onReanalyze,
  onReanalyzeAllErrors,
  onLoadMore,
  hasMore,
  loadingMore,
}: MessagesPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MessageRecord[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [aiFilter, setAiFilter] = useState<AiFilter>("analyzed");
  const [viewTab, setViewTab] = useState<"all" | "images">("all");
  const [retryingAll, setRetryingAll] = useState(false);
  const [retriedCount, setRetriedCount] = useState<number | null>(null);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowSearch(false);
      return;
    }
    setIsSearching(true);
    try {
      const params = new URLSearchParams({ q: searchQuery, limit: "50" });
      const data = await request<{ results: MessageRecord[] }>(
        `/api/analysis/search?${params}`,
      );
      setSearchResults(data.results || []);
      setShowSearch(true);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const stats = useMemo(() => {
    const base = showSearch ? searchResults : messages;
    return {
      total: base.length,
      clean: base.filter((m) => m.ai_status === "clean").length,
      flagged: base.filter((m) => m.ai_status === "flagged").length,
      error: base.filter((m) => m.ai_status === "error").length,
      pending: base.filter((m) => m.ai_status === "pending" || !m.ai_status)
        .length,
      deleted: base.filter((m) => m.deleted_at).length,
      edited: base.filter((m) => m.edited_at).length,
    };
  }, [messages, searchResults, showSearch]);

  const filteredMessages = useMemo(() => {
    const base = showSearch ? searchResults : messages;
    if (aiFilter === "all") return base;
    return base.filter((m) => {
      const status = m.ai_status ?? "pending";
      if (aiFilter === "analyzed")
        return status !== "pending" && status !== null && status !== undefined;
      if (aiFilter === "pending")
        return status === "pending" || status === null || status === undefined;
      return status === aiFilter;
    });
  }, [messages, searchResults, showSearch, aiFilter]);

  return (
    <motion.div
      className="grid gap-6"
      variants={cardStagger}
      initial="initial"
      animate="animate"
    >
      <motion.div variants={cardItem}>
        <Card>
          <CardHeader>
            <CardTitle className="text-primary">Messages</CardTitle>
            {guildName && (
              <p className="text-sm text-muted-foreground">
                Monitoring all text channels in{" "}
                <span className="font-medium text-foreground">{guildName}</span>
              </p>
            )}
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Messages are automatically captured from all text channels in the
              monitored guild. Real-time updates arrive via WebSocket.
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {stats.total > 0 && (
        <motion.div
          variants={cardItem}
          className="flex flex-wrap items-center gap-2"
        >
          <Badge
            variant="outline"
            className="text-xs border-primary/40 text-primary"
          >
            {stats.total} total{hasMore && !showSearch ? "+" : ""}
          </Badge>
          <Badge
            variant="outline"
            className="text-xs bg-success-soft text-success border-success/20"
          >
            {stats.clean} clean
          </Badge>
          <Badge
            variant="outline"
            className="text-xs bg-primary/10 text-primary border-primary/20"
          >
            {stats.flagged} flagged
          </Badge>
          <Badge
            variant="outline"
            className="text-xs bg-warning-soft text-warning border-warning/20"
          >
            {stats.error} error
          </Badge>
          <Badge
            variant="outline"
            className="text-xs text-muted-foreground border-border"
          >
            {stats.pending} pending
          </Badge>
          {stats.deleted > 0 && (
            <Badge
              variant="outline"
              className="text-xs bg-destructive-soft text-destructive border-destructive/20"
            >
              {stats.deleted} deleted
            </Badge>
          )}
          {stats.edited > 0 && (
            <Badge variant="outline" className="text-xs">
              {stats.edited} edited
            </Badge>
          )}
        </motion.div>
      )}

      <motion.div
        variants={cardItem}
        className="flex flex-wrap items-center gap-2"
      >
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
          <Input
            className="pl-9 rounded-full focus-visible:ring-primary"
            placeholder="Search message content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            disabled={isSearching}
          />
        </div>
        <Button
          onClick={handleSearch}
          disabled={isSearching || !searchQuery.trim()}
          size="sm"
          className="rounded-xl"
        >
          {isSearching ? "Searching..." : "Search"}
        </Button>
        {showSearch && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowSearch(false);
              setSearchResults([]);
              setSearchQuery("");
            }}
          >
            <X className="mr-1 h-3 w-3" /> Clear
          </Button>
        )}
        {stats.error > 0 && onReanalyzeAllErrors && (
          <Button
            variant="destructive"
            size="sm"
            disabled={retryingAll}
            onClick={async () => {
              setRetryingAll(true);
              setRetriedCount(null);
              try {
                const count = await onReanalyzeAllErrors();
                setRetriedCount(count);
              } finally {
                setRetryingAll(false);
              }
            }}
            className="rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20"
          >
            <RotateCw
              className={`mr-1.5 h-3.5 w-3.5 ${retryingAll ? "animate-spin" : ""}`}
            />
            {retryingAll ? "Retrying..." : `Retry All Errors (${stats.error})`}
          </Button>
        )}
        {retriedCount !== null && (
          <span className="text-xs text-success">
            {retriedCount} message{retriedCount !== 1 ? "s" : ""} queued for
            re-analysis
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Filter className="h-4 w-4 text-primary" />
          {(
            [
              "all",
              "analyzed",
              "clean",
              "flagged",
              "error",
              "pending",
            ] as AiFilter[]
          ).map((f) => (
            <button
              key={f}
              onClick={() => setAiFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                aiFilter === f
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </motion.div>

      {showSearch && searchResults.length > 0 && (
        <motion.div
          variants={cardItem}
          className="text-sm text-muted-foreground"
        >
          Found {searchResults.length} result
          {searchResults.length !== 1 ? "s" : ""}
        </motion.div>
      )}

      <motion.div variants={cardItem}>
        <Tabs
          value={viewTab}
          onValueChange={(v) => setViewTab(v as "all" | "images")}
        >
          <TabsList>
            <TabsTrigger value="all">
              {showSearch
                ? `Search (${filteredMessages.length})`
                : `All (${filteredMessages.length})`}
            </TabsTrigger>
            <TabsTrigger value="images">Images</TabsTrigger>
          </TabsList>
          <TabsContent value="all">
            <MessageFeed
              messages={filteredMessages}
              onReanalyze={onReanalyze}
              emptyText={
                showSearch
                  ? "No messages found matching your search."
                  : "No captures yet."
              }
              onLoadMore={showSearch ? undefined : onLoadMore}
              hasMore={showSearch ? false : hasMore}
              loadingMore={loadingMore}
            />
          </TabsContent>
          <TabsContent value="images">
            <ImageGrid messages={filteredMessages} />
          </TabsContent>
        </Tabs>
      </motion.div>
    </motion.div>
  );
}
