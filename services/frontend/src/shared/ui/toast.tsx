/* ═══════════════════════════════════════════════════════════════════════════
 * IMPHNEN Toast — Notifikasi ringan dengan IMPHNEN brand accent
 * ═══════════════════════════════════════════════════════════════════════════ */

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
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
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (message: string, type: Toast["type"] = "info") => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      setToasts((prev) => [...prev, { id, message, type }]);
      const timer = setTimeout(() => {
        removeToast(id);
      }, 4000);
      timersRef.current.set(id, timer);
    },
    [removeToast],
  );

  useEffect(() => {
    const current = timersRef.current;
    return () => {
      for (const timer of current.values()) {
        clearTimeout(timer);
      }
      current.clear();
    };
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
  info: "border-l-info bg-white text-info",
  success: "border-l-success bg-white text-success",
  error: "border-l-destructive bg-white text-destructive",
  warning: "border-l-warning bg-white text-warning",
};

const typeIcons: Record<Toast["type"], React.ReactNode> = {
  info: <Info className="h-4 w-4 text-info" />,
  success: <CheckCircle2 className="h-4 w-4 text-success" />,
  error: <AlertCircle className="h-4 w-4 text-destructive" />,
  warning: <AlertTriangle className="h-4 w-4 text-warning" />,
};

function ToastContainer() {
  const { toasts, removeToast } = useContext(ToastContext);

  if (toasts.length === 0) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed top-4 right-4 z-40 flex flex-col gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="button"
          tabIndex={0}
          className={cn(
            "group flex items-center gap-2.5 rounded-xl border border-[#e0e0e0] px-4 py-3 text-sm shadow-[0_4px_12px_rgba(0,0,0,0.08)] cursor-pointer transition-all duration-200 hover:scale-[1.02] border-l-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#23a1eb]/40",
            typeStyles[toast.type],
          )}
          onClick={() => removeToast(toast.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") {
              removeToast(toast.id);
            }
          }}
        >
          <span className="flex-shrink-0">{typeIcons[toast.type]}</span>
          <span className="flex-1 font-sans text-sm">{toast.message}</span>
          <X
            aria-label="Close notification"
            className="h-3.5 w-3.5 flex-shrink-0 text-[#999999] md:opacity-0 md:group-hover:opacity-100 transition-opacity"
          />
        </div>
      ))}
    </div>
  );
}
