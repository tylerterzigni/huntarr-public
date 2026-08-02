import { cn } from "@/lib/utils";

interface PosterImageProps {
  src: string;
  alt: string;
  className?: string;
  /** Prefer eager for above-the-fold priority posters. Default lazy. */
  loading?: "eager" | "lazy";
}

/**
 * Poster bitmap for grids/rows. Uses a native img (not next/image) so Chrome
 * does not leave optimized/lazy wrappers half-composited until hover.
 */
export function PosterImage({
  src,
  alt,
  className,
  loading = "lazy",
}: PosterImageProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- intentional; see comment above
    <img
      src={src}
      alt={alt}
      draggable={false}
      decoding="async"
      loading={loading}
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full object-cover transform-gpu",
        className
      )}
    />
  );
}
