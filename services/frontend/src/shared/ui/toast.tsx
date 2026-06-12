// ─── Toast notification system ──────────────────────────────────────────────
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
  info: "border-l-primary bg-card text-card-foreground",
  success: "border-l-emerald-500 bg-card text-card-foreground",
  error: "border-l-destructive bg-card text-card-foreground",
  warning: "border-l-amber-500 bg-card text-card-foreground",
};

const typeIcons: Record<Toast["type"], React.ReactNode> = {
  info: <Info className="h-4 w-4 text-primary" />,
  success: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  error: <AlertCircle className="h-4 w-4 text-destructive" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-500" />,
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
            "group flex items-center gap-2.5 rounded-lg border border-border px-4 py-3 text-sm shadow-md cursor-pointer transition-all hover:scale-[1.02] border-l-4",
            typeStyles[toast.type],
          )}
          onClick={() => removeToast(toast.id)}
        >
          <span className="flex-shrink-0">{typeIcons[toast.type]}</span>
          <span className="flex-1">{toast.message}</span>
          <X className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      ))}
    </div>
  );
}
