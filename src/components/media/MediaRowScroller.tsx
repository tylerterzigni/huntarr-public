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
}

export function MediaRowScroller({
  items: initialItems,
  className,
  showReason = true,
  applyVisibilityFilter = true,
}: MediaRowScrollerProps) {
  const { filterVisibleItems } = useLibraryWatchedVisibility();
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
    return applyVisibilityFilter ? filterVisibleItems(typed) : typed;
  }, [items, filterVisibleItems, applyVisibilityFilter]);

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
