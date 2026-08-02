"use client";

import { useEffect, useMemo, useState } from "react";
import { MediaCard } from "./MediaCard";
import { HorizontalScrollRow } from "./HorizontalScrollRow";
import { useLibraryWatchedVisibility } from "@/components/providers/LibraryWatchedVisibilityProvider";
import {
  HUNTARR_TITLE_HIDDEN_EVENT,
  matchesHiddenTitle,
  type TitleHiddenDetail,
} from "@/lib/hide-list/client";
import type { RecommendationItem, TmdbMediaItem } from "@/types";

interface MediaRowScrollerProps {
  items: (TmdbMediaItem | RecommendationItem)[];
  className?: string;
  showReason?: boolean;
  /** When false, keep in-library / watched titles (e.g. Recent Requests). Default true. */
  applyVisibilityFilter?: boolean;
  /**
   * Max posters after visibility filtering. Extra pool items backfill hidden
   * library/watched slots. Omit to show the full filtered list (e.g. filmography).
   */
  visibleLimit?: number;
}

export function MediaRowScroller({
  items: initialItems,
  className,
  showReason = true,
  applyVisibilityFilter = true,
  visibleLimit,
}: MediaRowScrollerProps) {
  const { filterVisibleItems, selectVisibleRowItems } = useLibraryWatchedVisibility();
  const [items, setItems] = useState(initialItems);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    function onTitleHidden(event: Event) {
      const detail = (event as CustomEvent<TitleHiddenDetail>).detail;
      if (!detail) return;
      setItems((prev) => prev.filter((item) => !matchesHiddenTitle(item, detail)));
    }
    window.addEventListener(HUNTARR_TITLE_HIDDEN_EVENT, onTitleHidden);
    return () => window.removeEventListener(HUNTARR_TITLE_HIDDEN_EVENT, onTitleHidden);
  }, []);

  const visibleItems = useMemo(() => {
    const typed = items as RecommendationItem[];
    if (!applyVisibilityFilter) return typed;
    if (visibleLimit != null) {
      return selectVisibleRowItems(typed, visibleLimit);
    }
    return filterVisibleItems(typed);
  }, [items, filterVisibleItems, selectVisibleRowItems, applyVisibilityFilter, visibleLimit]);

  if (visibleItems.length === 0) return null;

  return (
    <HorizontalScrollRow className={className}>
      {visibleItems.map((item) => (
        <MediaCard
          key={`${item.id}-${item.poster_path}`}
          item={item}
          showReason={showReason}
          onHidden={() =>
            setItems((prev) => prev.filter((entry) => entry.id !== item.id))
          }
        />
      ))}
    </HorizontalScrollRow>
  );
}
