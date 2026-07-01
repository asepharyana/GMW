import type { MessageRecord } from "@bete/shared";
import { create } from "zustand";

type MessagesUpdater =
  | MessageRecord[]
  | ((prev: MessageRecord[]) => MessageRecord[]);

interface MessageState {
  messages: MessageRecord[];
}

interface MessageActions {
  setMessages: (updater: MessagesUpdater) => void;
  prependMessage: (message: MessageRecord) => void;
  updateMessage: (id: string, updates: Partial<MessageRecord>) => void;
  removeMessage: (id: string) => void;
}

export const useMessageStore = create<MessageState & MessageActions>((set) => ({
  messages: [],

  setMessages: (updater) =>
    set((state) => ({
      messages:
        typeof updater === "function" ? updater(state.messages) : updater,
    })),

  prependMessage: (message) =>
    set((state) => {
      if (state.messages.some((m) => m.id === message.id)) {
        return state;
      }
      return { messages: [message, ...state.messages] };
    }),

  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, ...updates } : m,
      ),
    })),

  removeMessage: (id) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, type: "deleted" as const } : m,
      ),
    })),
}));
