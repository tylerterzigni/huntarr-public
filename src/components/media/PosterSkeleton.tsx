import { MEDIA_CARD_WIDTH_PX } from "./constants";

interface PosterSkeletonProps {
  layout?: "grid" | "row";
  className?: string;
}

export function PosterSkeleton({ layout = "row", className = "" }: PosterSkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-seerr-card ${layout === "grid" ? "w-full" : "shrink-0"} ${className}`}
      style={
        layout === "row"
          ? { width: MEDIA_CARD_WIDTH_PX, height: MEDIA_CARD_WIDTH_PX * 1.5 }
          : { height: MEDIA_CARD_WIDTH_PX * 1.5 }
      }
      aria-hidden
    />
  );
}
