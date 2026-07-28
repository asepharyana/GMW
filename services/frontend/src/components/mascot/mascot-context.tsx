"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type MascotExpression = "idle" | "listening" | "surprise" | "happy" | "sad" | "talking";

interface MascotContextType {
  expression: MascotExpression;
  minimized: boolean;
  chatOpen: boolean;
  chatHistory: { role: "user" | "assistant"; text: string }[];
  setExpression: (expr: MascotExpression) => void;
  setMinimized: (v: boolean) => void;
  setChatOpen: (v: boolean) => void;
  addChat: (role: "user" | "assistant", text: string) => void;
}

const MascotContext = createContext<MascotContextType | null>(null);

export function MascotProvider({ children }: { children: ReactNode }) {
  const [expression, setExpression] = useState<MascotExpression>("idle");
  const [minimized, setMinimized] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "assistant"; text: string }[]>([]);

  const addChat = (role: "user" | "assistant", text: string) => {
    setChatHistory((prev) => [...prev, { role, text }]);
  };

  return (
    <MascotContext.Provider
      value={{ expression, minimized, chatOpen, chatHistory, setExpression, setMinimized, setChatOpen, addChat }}
    >
      {children}
    </MascotContext.Provider>
  );
}

export function useMascot() {
  const ctx = useContext(MascotContext);
  if (!ctx) throw new Error("useMascot must be used within MascotProvider");
  return ctx;
}
