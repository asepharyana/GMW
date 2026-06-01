import { ScrollArea } from "../../../shared/ui";
import type { MessageRecord } from "../../../shared/api/client";
import { MessageCard, MessageCardSkeleton } from "./MessageCard";

export interface MessageFeedProps {
  messages: MessageRecord[];
  onReanalyze: (id: string) => Promise<void>;
  emptyText?: string;
  loading?: boolean;
}

export function MessageFeed({ messages, onReanalyze, emptyText = "No messages found.", loading }: MessageFeedProps) {
  if (loading) {
    return (
      <ScrollArea className="h-[calc(100vh-260px)] pr-3">
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <MessageCardSkeleton key={i} />)}
        </div>
      </ScrollArea>
    );
  }

  if (messages.length === 0) {
    return <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{emptyText}</div>;
  }

  return (
    <ScrollArea className="h-[calc(100vh-260px)] pr-3">
      <div className="space-y-3">
        {messages.map((message) => (
          <MessageCard key={message.id} message={message} onReanalyze={onReanalyze} />
        ))}
      </div>
    </ScrollArea>
  );
}
