// ─── Toast notification system ──────────────────────────────────────────────
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";
import { cn } from "../lib/utils";

interface Toast {
  id: string;
  message: string;
  type: "info" | "success" | "error" | "warning";
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (message: string, type?: Toast["type"]) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType>({
  toasts: [],
  addToast: () => {},
  removeToast: () => {},
});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    (message: string, type: Toast["type"] = "info") => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(
        () => setToasts((prev) => prev.filter((t) => t.id !== id)),
        4000,
      );
    },
    [],
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

const typeStyles: Record<Toast["type"], string> = {
  info: "border-l-primary bg-white text-foreground",
  success: "border-l-green-500 bg-white text-foreground",
  error: "border-l-red-500 bg-white text-foreground",
  warning: "border-l-amber-500 bg-white text-foreground",
};

const typeIcons: Record<Toast["type"], string> = {
  info: "💠",
  success: "🌸",
  error: "😿",
  warning: "⚠️",
};

function ToastContainer() {
  const { toasts, removeToast } = useContext(ToastContext);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm shadow-md cursor-pointer transition-all hover:scale-[1.02] border-l-4",
            typeStyles[toast.type],
          )}
          onClick={() => removeToast(toast.id)}
        >
          <span className="text-base leading-none">
            {typeIcons[toast.type]}
          </span>
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
