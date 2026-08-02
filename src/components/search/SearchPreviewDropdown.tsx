"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { posterUrl, profileUrl, cn } from "@/lib/utils";
import { PosterImage } from "@/components/media/PosterImage";
import type { SearchPreviewItem } from "@/lib/search/run-search";

function previewHref(item: SearchPreviewItem): string {
  if (item.kind === "person") return `/person/${item.id}`;
  return item.kind === "movie" ? `/movie/${item.id}` : `/tv/${item.id}`;
}

function previewImage(item: SearchPreviewItem): string {
  if (item.kind === "person") return profileUrl(item.imagePath, "w185");
  return posterUrl(item.imagePath, "w342");
}

interface SearchPreviewCardProps {
  item: SearchPreviewItem;
  onSelect: () => void;
}

function SearchPreviewCard({ item, onSelect }: SearchPreviewCardProps) {
  const href = previewHref(item);

  return (
    <Link
      href={href}
      onClick={onSelect}
      draggable={false}
      className={cn(
        "group block w-full min-w-0 transition-transform hover:scale-105 hover:z-10"
      )}
    >
      <div className="media-poster-frame relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-seerr-card shadow-lg">
        <PosterImage src={previewImage(item)} alt={item.name} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <p className="mt-2 text-sm font-medium line-clamp-2 text-foreground/90">{item.name}</p>
      {item.kind === "person" && item.subtitle && (
        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{item.subtitle}</p>
      )}
    </Link>
  );
}

interface SearchPreviewDropdownProps {
  items: SearchPreviewItem[];
  loading: boolean;
  loadingMore?: boolean;
  searched: boolean;
  hasMore?: boolean;
  onSelect: () => void;
  onLoadMore?: () => void;
  onScrollContent?: () => void;
}

export function SearchPreviewDropdown({
  items,
  loading,
  loadingMore = false,
  searched,
  hasMore = false,
  onSelect,
  onLoadMore,
  onScrollContent,
}: SearchPreviewDropdownProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = scrollRef.current;
    const target = loadMoreRef.current;
    if (!root || !target || !hasMore || !onLoadMore || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMore();
        }
      },
      { root, rootMargin: "80px 0px", threshold: 0 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore, loadingMore, items.length]);

  return (
    <div
      className={cn(
        "z-50 rounded-lg border border-gray-300 bg-white shadow-xl",
        "absolute left-0 top-full mt-2 w-[min(100vw-2rem,420px)]",
        "max-md:fixed max-md:left-1/2 max-md:top-[calc(var(--safe-area-top)+5rem+0.5rem)] max-md:mt-0 max-md:w-[min(calc(100vw-2rem),420px)] max-md:-translate-x-1/2"
      )}
    >
      <div
        ref={scrollRef}
        className="max-h-[min(26rem,calc(100dvh-var(--safe-area-top)-8rem))] overflow-x-hidden overflow-y-auto p-4"
        onScroll={onScrollContent}
        onTouchMove={onScrollContent}
      >
        {loading && <p className="px-1 py-2 text-sm text-muted-foreground">Searching...</p>}
        {searched && !loading && items.length === 0 && (
          <p className="px-1 py-2 text-sm text-muted-foreground">No results found.</p>
        )}
        {items.length > 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-x-4 gap-y-5">
              {items.map((item) => (
                <SearchPreviewCard
                  key={`${item.kind}:${item.id}`}
                  item={item}
                  onSelect={onSelect}
                />
              ))}
            </div>
            {(hasMore || loadingMore) && (
              <div
                ref={loadMoreRef}
                className="flex justify-center py-2"
                aria-hidden={!loadingMore}
              >
                {loadingMore && (
                  <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
