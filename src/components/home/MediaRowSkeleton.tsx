import { MEDIA_CARD_WIDTH_PX } from "@/components/media/constants";

interface MediaRowSkeletonProps {
  title: string;
  subtitle?: string;
  count?: number;
}

export function MediaRowSkeleton({ title, subtitle, count = 8 }: MediaRowSkeletonProps) {
  return (
    <section
      className="mb-5 md:mb-10"
      aria-busy="true"
      aria-label={`Loading ${title}`}
      data-huntarr-loading="true"
    >
      <div className="mb-2 px-4 md:mb-4 md:px-8">
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-sm text-gray-600 mt-1">{subtitle}</p>}
      </div>
      <div className="flex gap-4 overflow-x-hidden px-4 pb-2 md:px-8 md:pb-4">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="shrink-0 animate-pulse rounded-lg bg-seerr-card"
            style={{ width: MEDIA_CARD_WIDTH_PX, height: MEDIA_CARD_WIDTH_PX * 1.5 }}
          />
        ))}
      </div>
    </section>
  );
}

export function BrowseRowsSkeleton() {
  return (
    <>
      <MediaRowSkeleton title="Trending This Week" />
      <MediaRowSkeleton title="Popular Movies" />
      <MediaRowSkeleton title="Popular TV Shows" />
    </>
  );
}
