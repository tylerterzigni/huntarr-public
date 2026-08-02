import { cn } from "@/lib/utils";

export function RottenTomatoesIcon({
  rating,
  className,
}: {
  rating: "Certified Fresh" | "Fresh" | "Rotten";
  className?: string;
}) {
  const isFresh = rating !== "Rotten";

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("h-4 w-4 flex-shrink-0", className)}
    >
      <circle cx="12" cy="12" r="11" fill={isFresh ? "#fa320a" : "#0ac855"} />
      <circle cx="12" cy="12" r="7.5" fill={isFresh ? "#0ac855" : "#fa320a"} />
    </svg>
  );
}

export function TmdbIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-4 items-center rounded bg-[#0d253f] px-1 text-[9px] font-bold leading-none text-[#01d277]",
        className
      )}
    >
      TMDB
    </span>
  );
}
