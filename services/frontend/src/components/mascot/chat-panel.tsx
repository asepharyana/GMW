"use client";

import { Send } from "lucide-react";
import { useState } from "react";
import { useMascot } from "./mascot-context";

export function ChatPanel() {
  const { chatHistory, addChat, setExpression } = useMascot();
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;
    addChat("user", input);
    setExpression("listening");

    // Simulated bot response — replace with actual mascot-chat API call
    setTimeout(() => {
      addChat("assistant", "I'm monitoring this server for you!");
      setExpression("happy");
    }, 800);

    setInput("");
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
        {chatHistory.slice(-6).map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <span className={`text-[10px] px-2 py-1 rounded-lg max-w-[85%] ${
              msg.role === "user"
                ? "bg-primary/20 text-text-primary"
                : "glass text-text-secondary"
            }`}>
              {msg.text}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 px-2 py-1 border-t border-glass-border">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Ask mascot..."
          className="flex-1 bg-transparent text-[10px] text-text-primary placeholder-text-secondary/30 outline-none"
        />
        <button type="button" onClick={handleSend} className="size-5 flex items-center justify-center">
          <Send className="size-3 text-primary" />
        </button>
      </div>
    </div>
  );
}
