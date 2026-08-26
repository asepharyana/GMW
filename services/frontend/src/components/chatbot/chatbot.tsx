"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Bot, MessageSquare, Send, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, toast } from "@/components/primitives";
import { MarkdownLite } from "@/components/shared";
import { useChatbotUserId } from "@/hooks/use-chatbot-user";
import { chatbotApi } from "@/lib/api";
import { cn } from "@/lib/utils";

if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP);
}

interface Msg {
  id: string;
  role: "user" | "bot";
  content: string;
  ts: number;
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function Chatbot() {
  const userId = useChatbotUserId();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!open || !panelRef.current) return;
      gsap.fromTo(
        panelRef.current,
        { opacity: 0, y: 12, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.22, ease: "power2.out" },
      );
    },
    { dependencies: [open] },
  );

  useEffect(() => {
    if (!open || !userId) return;
    chatbotApi
      .getHistory(userId)
      .then((res) => {
        setMsgs(
          res.history.slice(-12).flatMap((h) => [
            {
              id: `${h.id}-u`,
              role: "user" as const,
              content: h.user_message,
              ts: Date.parse(h.created_at) || Date.now(),
            },
            {
              id: `${h.id}-b`,
              role: "bot" as const,
              content: h.bot_response,
              ts: Date.parse(h.created_at) || Date.now(),
            },
          ]),
        );
      })
      .catch(() => {});
  }, [open, userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const send = async (text: string) => {
    if (!text.trim() || loading || !userId) return;
    setInput("");
    setMsgs((m) => [
      ...m,
      { id: `u-${Date.now()}`, role: "user", content: text, ts: Date.now() },
    ]);
    setLoading(true);
    try {
      const res = await chatbotApi.send(text, undefined, userId);
      setMsgs((m) => [
        ...m,
        {
          id: `b-${Date.now()}`,
          role: "bot",
          content: res.response,
          ts: Date.parse(res.timestamp) || Date.now(),
        },
      ]);
    } catch (e) {
      toast({ title: "Chat error", description: String(e), tone: "vermilion" });
    } finally {
      setLoading(false);
    }
  };

  const clearAll = async () => {
    if (!userId) return;
    setMsgs([]);
    try {
      await chatbotApi.clearHistory(userId);
    } catch {
      /* best-effort */
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="Open assistant"
        onClick={() => setOpen((o) => !o)}
        className="fixed right-4 bottom-5 z-50 flex size-10 items-center justify-center rounded-full border border-white/[0.12] bg-[#0f1011] text-[#f7f8f8] shadow-2xl transition-all duration-150 hover:scale-105 hover:border-[#7170ff] hover:bg-[#191a1b]"
      >
        {open ? (
          <X className="size-4" />
        ) : (
          <MessageSquare className="size-4 text-[#7170ff]" />
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="fixed right-4 bottom-18 z-50 flex h-[min(65dvh,480px)] w-[min(92vw,350px)] flex-col rounded-[10px] border border-white/[0.08] bg-[#0f1011]/95 p-0 shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-center justify-between border-b border-white/[0.06] px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-md bg-[#7170ff]/15 text-[#7170ff]">
                <Bot className="size-3.5" />
              </span>
              <div>
                <div className="text-xs font-semibold text-[#f7f8f8]">
                  Linear Assistant
                </div>
                <div className="font-mono text-[9px] text-[#62666d]">
                  active context
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={clearAll}
              className="rounded-[5px] p-1 text-[#62666d] hover:bg-white/[0.05] hover:text-[#d0d6e0]"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3">
            {msgs.length === 0 && !loading && (
              <div className="py-8 text-center text-xs text-[#62666d]">
                Ask anything about telemetry, moderation, or media.
              </div>
            )}
            {msgs.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "flex flex-col text-xs",
                  m.role === "user" ? "items-end" : "items-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-[6px] px-2.5 py-1.5",
                    m.role === "user"
                      ? "bg-[#5e6ad2] text-white"
                      : "border border-white/[0.06] bg-white/[0.03] text-[#d0d6e0]",
                  )}
                >
                  {m.role === "bot" ? (
                    <MarkdownLite content={m.content} />
                  ) : (
                    <span>{m.content}</span>
                  )}
                </div>
                <span className="font-mono mt-0.5 text-[9px] text-[#62666d]">
                  {formatTime(m.ts)}
                </span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-1.5 border-t border-white/[0.06] p-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask command..."
              className="flex-1 rounded-[5px] border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-xs text-[#f7f8f8] placeholder:text-[#62666d] focus:border-[#7170ff] focus:outline-none"
            />
            <Button type="submit" size="sm" variant="primary">
              <Send className="size-3" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
