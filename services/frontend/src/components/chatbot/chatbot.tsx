"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send, X, MessageCircle } from "lucide-react";
import { chatbotApi } from "@/lib/api";
import { useChatbotUserId } from "@/hooks/use-chatbot-user";
import { GlassPanel, Input, Button, Avatar } from "@/components/primitives";
import { toast } from "@/components/primitives";
import { cn } from "@/lib/utils";

interface Msg {
  role: "user" | "bot";
  content: string;
}

export function Chatbot() {
  const userId = useChatbotUserId();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !userId) return;
    chatbotApi
      .getHistory(userId)
      .then((res) => {
        setMsgs(
          res.history
            .slice(-12)
            .flatMap((h) => [
              { role: "user" as const, content: h.user_message },
              { role: "bot" as const, content: h.bot_response },
            ]),
        );
      })
      .catch(() => {});
  }, [open, userId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading || !userId) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", content: text }]);
    setLoading(true);
    try {
      const res = await chatbotApi.send(text, undefined, userId);
      setMsgs((m) => [...m, { role: "bot", content: res.response }]);
    } catch (e) {
      toast({ title: "Chat error", description: String(e), tone: "vermilion" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="Open assistant"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-50 flex items-center justify-center rounded-full bg-signal text-signal-ink shadow-[0_10px_30px_-8px_var(--color-signal-glow)] transition-transform hover:scale-105"
        style={{ width: 52, height: 52 }}
      >
        {open ? <X className="size-5" /> : <MessageCircle className="size-5" />}
      </button>

      {open && (
        <GlassPanel
          className="fixed bottom-20 right-5 z-50 flex w-[min(92vw,360px)] flex-col p-0"
          style={{ animation: "fade-up 0.16s ease", height: 460 }}
        >
          <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
            <span className="flex size-8 items-center justify-center rounded-full bg-signal/15 text-signal">
              <Bot className="size-4" />
            </span>
            <div>
              <div className="text-sm font-semibold text-ink">GMW Assistant</div>
              <div className="mono text-[0.6rem] text-ink-faint">context-aware</div>
            </div>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {msgs.length === 0 && (
              <div className="py-8 text-center text-xs text-ink-faint">
                Ask about moderation, voice, or media.
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={cn("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}>
                {m.role === "bot" && <Avatar name="GMW" size={26} className="mt-0.5 bg-signal/15 text-signal" />}
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                    m.role === "user"
                      ? "rounded-br-sm bg-signal/20 text-ink"
                      : "rounded-bl-sm bg-white/5 text-ink-soft",
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <Avatar name="GMW" size={26} className="bg-signal/15 text-signal" />
                <div className="rounded-2xl rounded-bl-sm bg-white/5 px-3 py-2 text-sm text-ink-faint">…</div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-hairline p-3">
            <Input
              placeholder="Message…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <Button variant="primary" size="icon" onClick={send} disabled={loading}>
              <Send className="size-4" />
            </Button>
          </div>
        </GlassPanel>
      )}
    </>
  );
}
