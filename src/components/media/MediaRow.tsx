import { MediaRowScroller } from "./MediaRowScroller";
import type { RecommendationItem, TmdbMediaItem } from "@/types";

interface MediaRowProps {
  title: string;
  subtitle?: string;
  items: (TmdbMediaItem | RecommendationItem)[];
  showReason?: boolean;
  /** When false, keep in-library / watched titles (e.g. Recent Requests). Default true. */
  applyVisibilityFilter?: boolean;
}

export function MediaRow({
  title,
  subtitle,
  items,
  showReason = true,
  applyVisibilityFilter = true,
}: MediaRowProps) {
  if (items.length === 0) return null;

  return (
    <section className="mb-5 md:mb-10">
      <div className="mb-2 px-4 md:mb-4 md:px-8">
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-sm text-gray-600 mt-1">{subtitle}</p>}
      </div>
      <MediaRowScroller
        className="px-4 pb-2 md:px-8 md:pb-4"
        items={items}
        showReason={showReason}
        applyVisibilityFilter={applyVisibilityFilter}
      />
    </section>
  );
}
