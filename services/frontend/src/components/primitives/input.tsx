import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-[8px] bg-surface-2 border border-hairline px-3.5 text-ink",
        // text-base (16px) on touch so iOS Safari doesn't auto-zoom on focus;
        // back to text-sm on ≥sm where a physical pointer/keyboard is expected.
        "text-base sm:text-sm",
        "placeholder:text-ink-faint transition-colors",
        "focus:outline-none focus:border-signal/50 focus:bg-surface",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-[8px] bg-surface-2 border border-hairline px-3.5 py-2.5 text-ink",
        // text-base (16px) on touch to avoid iOS auto-zoom on focus.
        "text-base sm:text-sm",
        "placeholder:text-ink-faint transition-colors resize-none",
        "focus:outline-none focus:border-signal/50 focus:bg-surface",
        className,
      )}
      {...props}
    />
  );
}
