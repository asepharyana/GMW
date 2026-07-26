"use client";

import {
  Bot,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { chatbotApi } from "@/lib/api";
import type { ChatHistoryMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Chatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatHistoryMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    chatbotApi
      .getHistory()
      .then(setMessages)
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  const handleClear = useCallback(async () => {
    try {
      await chatbotApi.clearHistory();
      setMessages([]);
    } catch (err) {
      console.error("chatbot/clearHistory:", err);
    }
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    const text = input.trim();
    setInput("");

    // Add optimistic user message
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text, timestamp: new Date().toISOString() },
    ]);

    try {
      const resp = await chatbotApi.send(text);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: resp.response,
          timestamp: resp.timestamp,
        },
      ]);
    } catch (err) {
      console.error("chatbot/send:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I couldn't process that request.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }, [input, sending]);

  return (
    <>
      {/* Toggle button */}
      <Button
        onClick={() => setOpen(!open)}
        size="icon"
        aria-label={open ? "Close chat" : "Open chat"}
        className={cn(
          "fixed bottom-4 right-4 z-50 size-12 rounded-full shadow-lg transition-all duration-200",
          open && "scale-90 opacity-80 hover:scale-100 hover:opacity-100",
        )}
      >
        {open ? <X className="size-5" /> : <MessageCircle className="size-5" />}
      </Button>

      {/* Chat panel */}
      {open && (
        <Card className="fixed bottom-20 right-4 z-50 w-80 sm:w-96 shadow-xl border-border/50 animate-fade-in-up">
          <CardHeader className="border-b border-border/50 bg-gradient-to-r from-primary/5 to-primary/[0.02]">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <div className="flex size-6 items-center justify-center rounded-full bg-primary/10">
                <Bot className="size-3.5 text-primary" />
              </div>
              Chatbot
              <Sparkles className="size-3 text-primary/60 ml-0.5" />
              <div className="flex-1" />
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleClear}
                  title="Clear history"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </CardTitle>
          </CardHeader>

          <CardContent className="p-0">
            <ScrollArea className="h-80">
              <div ref={scrollRef} className="space-y-3 p-3">
                {messages.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground py-12">
                    Ask me anything about the server!
                  </p>
                )}
                {messages.map((msg) => (
                  <div
                    key={msg.timestamp + msg.role}
                    className={cn(
                      "flex items-start gap-2",
                      msg.role === "user" && "flex-row-reverse",
                    )}
                  >
                    <Avatar className="size-6 shrink-0">
                      <AvatarFallback className="text-[10px] bg-muted">
                        {msg.role === "user" ? (
                          <User className="size-3" />
                        ) : (
                          <Bot className="size-3" />
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className={cn(
                        "rounded-xl px-3 py-2 text-sm max-w-[80%] leading-relaxed",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/70",
                      )}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {sending && (
                  <div className="flex items-start gap-2">
                    <Avatar className="size-6 shrink-0">
                      <AvatarFallback className="text-[10px] bg-muted">
                        <Bot className="size-3" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="rounded-xl bg-muted/70 px-3 py-2">
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>

          <CardFooter className="border-t border-border/50 p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex w-full gap-2"
            >
              <Input
                type="text"
                placeholder="Ask the mascot…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={sending}
                className="h-8 flex-1"
              />
              <Button
                type="submit"
                size="icon-sm"
                disabled={!input.trim() || sending}
              >
                {sending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </Button>
            </form>
          </CardFooter>
        </Card>
      )}
    </>
  );
}
