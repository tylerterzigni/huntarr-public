"use client";

interface PersonalizeProgressBarProps {
  ranked: number;
  total: number;
  done: boolean;
  /** Show indeterminate animation before first ranked batch arrives. */
  indeterminate?: boolean;
}

export function PersonalizeProgressBar({
  ranked,
  total,
  done,
  indeterminate = false,
}: PersonalizeProgressBarProps) {
  if (done) return null;

  const percent =
    total > 0 && ranked > 0 ? Math.min(100, Math.round((ranked / total) * 100)) : 0;

  return (
    <div className="space-y-1.5" role="status" aria-live="polite">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {ranked > 0
            ? "Fine-tuning order in the background"
            : "Sorting by your taste…"}
        </span>
        {ranked > 0 && <span>{percent}%</span>}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200/80">
        <div
          className={`h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 ${
            indeterminate || ranked === 0
              ? "w-1/3 animate-[personalize-indeterminate_1.2s_ease-in-out_infinite]"
              : "transition-[width] duration-500 ease-out"
          }`}
          style={ranked > 0 ? { width: `${percent}%` } : undefined}
        />
      </div>
    </div>
  );
}
