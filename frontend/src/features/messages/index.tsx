import { useState, useMemo } from "react";
import type { Channel, Guild, MessageRecord } from "../../shared/api/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Badge, Button, Input, Select, Tabs, TabsContent, TabsList, TabsTrigger } from "../../shared/ui";
import { MessageFeed } from "./components/MessageFeed";
import { ImageGrid } from "./components/ImageGrid";
import { Search, X, Filter } from "lucide-react";

interface MessagesPanelProps {
  guilds: Guild[];
  channels: Channel[];
  selectedGuild: string;
  selectedChannel: string;
  messages: MessageRecord[];
  onGuildChange: (guildId: string) => void;
  onChannelChange: (channelId: string) => void;
  onReanalyze: (id: string) => Promise<void>;
}

type AiFilter = "all" | "clean" | "warn" | "flagged" | "error" | "pending";

export function MessagesPanel({
  guilds, channels, selectedGuild, selectedChannel,
  messages, onGuildChange, onChannelChange, onReanalyze,
}: MessagesPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MessageRecord[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [aiFilter, setAiFilter] = useState<AiFilter>("all");
  const [viewTab, setViewTab] = useState<"all" | "images">("all");

  const handleSearch = async () => {
    if (!searchQuery.trim()) { setSearchResults([]); setShowSearch(false); return; }
    setIsSearching(true);
    try {
      const params = new URLSearchParams({ q: searchQuery, ...(selectedChannel && { channelId: selectedChannel }), limit: "50" });
      const response = await fetch(`/api/analysis/search?${params}`);
      if (!response.ok) throw new Error("Search failed");
      const data = await response.json();
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
      warn: base.filter((m) => m.ai_status === "warn").length,
      flagged: base.filter((m) => m.ai_status === "flagged").length,
      error: base.filter((m) => m.ai_status === "error").length,
      pending: base.filter((m) => m.ai_status === "pending" || !m.ai_status).length,
      deleted: base.filter((m) => m.deleted_at).length,
      edited: base.filter((m) => m.edited_at).length,
    };
  }, [messages, searchResults, showSearch]);

  const filteredMessages = useMemo(() => {
    const base = showSearch ? searchResults : messages;
    if (aiFilter === "all") return base;
    return base.filter((m) => {
      const status = m.ai_status ?? "pending";
      if (aiFilter === "pending") return status === "pending" || status === null || status === undefined;
      return status === aiFilter;
    });
  }, [messages, searchResults, showSearch, aiFilter]);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Message Source</CardTitle>
          <CardDescription>Pick a guild and channel/thread to inspect captures.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Select value={selectedGuild} onChange={(e) => onGuildChange(e.target.value)} placeholder="Select text guild" options={guilds.map((g) => ({ value: g.id, label: g.name }))} />
          <Select value={selectedChannel} onChange={(e) => onChannelChange(e.target.value)} placeholder="Select channel or thread" options={channels.map((c) => ({ value: c.id, label: c.name }))} />
        </CardContent>
      </Card>

      {stats.total > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-xs">{stats.total} total</Badge>
          <Badge variant="outline" className="text-xs text-green-400 border-green-400/30">{stats.clean} clean</Badge>
          <Badge variant="outline" className="text-xs text-yellow-400 border-yellow-400/30">{stats.warn} warn</Badge>
          <Badge variant="outline" className="text-xs text-red-400 border-red-400/30">{stats.flagged} flagged</Badge>
          <Badge variant="outline" className="text-xs text-orange-400 border-orange-400/30">{stats.error} error</Badge>
          <Badge variant="outline" className="text-xs">{stats.pending} pending</Badge>
          {stats.deleted > 0 && <Badge variant="destructive" className="text-xs">{stats.deleted} deleted</Badge>}
          {stats.edited > 0 && <Badge variant="outline" className="text-xs">{stats.edited} edited</Badge>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search message content..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} disabled={isSearching} />
        </div>
        <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()} size="sm">{isSearching ? "Searching..." : "Search"}</Button>
        {showSearch && (
          <Button variant="outline" size="sm" onClick={() => { setShowSearch(false); setSearchResults([]); setSearchQuery(""); }}>
            <X className="mr-1 h-3 w-3" /> Clear
          </Button>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {(["all", "clean", "warn", "flagged", "error", "pending"] as AiFilter[]).map((f) => (
            <button key={f} onClick={() => setAiFilter(f)} className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${aiFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {showSearch && searchResults.length > 0 && (
        <div className="text-sm text-muted-foreground">Found {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}</div>
      )}

      <Tabs value={viewTab} onValueChange={(v) => setViewTab(v as "all" | "images")}>
        <TabsList>
          <TabsTrigger value="all">{showSearch ? `Search (${filteredMessages.length})` : `All (${filteredMessages.length})`}</TabsTrigger>
          <TabsTrigger value="images">Images</TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <MessageFeed messages={filteredMessages} onReanalyze={onReanalyze} emptyText={showSearch ? "No messages found matching your search." : selectedChannel ? "No captures yet." : "Select a channel to view captures."} />
        </TabsContent>
        <TabsContent value="images">
          <ImageGrid messages={filteredMessages} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
