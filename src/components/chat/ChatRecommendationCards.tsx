import Link from "next/link";
import Image from "next/image";
import { posterUrl } from "@/lib/utils";
import { getMediaTitle, inferMediaType } from "@/lib/integrations/tmdb/helpers";
import type { RecommendationItem } from "@/types";

interface ChatRecommendationCardsProps {
  items: RecommendationItem[];
}

export function ChatRecommendationCards({ items }: ChatRecommendationCardsProps) {
  if (items.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      {items.map((item) => {
        const mediaType = inferMediaType(item);
        const title = getMediaTitle(item);
        const href = mediaType === "movie" ? `/movie/${item.id}` : `/tv/${item.id}`;
        const summary = item.reason ?? item.overview;

        return (
          <Link
            key={`${mediaType}-${item.id}`}
            href={href}
            className="flex gap-3 rounded-lg border border-gray-300/70 bg-white/40 p-2 shadow-none backdrop-blur-md transition-colors hover:bg-white/55"
          >
            <div className="relative h-[90px] w-[60px] flex-shrink-0 overflow-hidden rounded-md bg-gray-200">
              <Image
                src={posterUrl(item.poster_path, "w185")}
                alt={title}
                fill
                className="object-cover"
                sizes="60px"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-sm font-medium text-gray-900">{title}</p>
              {summary && (
                <p className="mt-1 line-clamp-3 text-xs text-gray-600">{summary}</p>
              )}
              {item.vote_average != null && item.vote_average > 0 && (
                <p className="mt-1 text-[10px] text-gray-500">
                  ★ {item.vote_average.toFixed(1)}
                </p>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
