import { cn } from "../lib/utils";

/**
 * Friendly branded loader for customer-facing screens: pulsing logo ring
 * with an optional message, instead of a bare spinner.
 */
export function BrandedLoader({
  message = "Loading…",
  className,
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4", className)}>
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-2xl bg-primary/20 animate-ping" />
        <div className="relative w-16 h-16 rounded-2xl bg-white dark:bg-card border border-border shadow-lg flex items-center justify-center">
          <img src="/skytalk-logo.svg" alt="" className="w-9 h-9 animate-pulse" />
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" />
      </div>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
