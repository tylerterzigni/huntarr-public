"use client";

interface SyncProgressBarProps {
  current: number;
  total: number;
  message: string;
}

export function SyncProgressBar({ current, total, message }: SyncProgressBarProps) {
  const percent =
    total > 0 && current > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const indeterminate = current <= 0;

  return (
    <div className="space-y-1.5" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{message || "Syncing…"}</span>
        {!indeterminate && <span className="shrink-0">{percent}%</span>}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200/80 dark:bg-white/10">
        <div
          className={`h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 ${
            indeterminate
              ? "w-1/3 animate-[personalize-indeterminate_1.2s_ease-in-out_infinite]"
              : "transition-[width] duration-300 ease-out"
          }`}
          style={indeterminate ? undefined : { width: `${Math.max(percent, 4)}%` }}
        />
      </div>
    </div>
  );
}
