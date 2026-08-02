"use client";

import { useEffect, useMemo, useState } from "react";
import { MediaCard } from "@/components/media/MediaCard";
import { HorizontalScrollRow } from "@/components/media/HorizontalScrollRow";
import { PosterSkeleton } from "@/components/media/PosterSkeleton";
import { PersonalizeSortButton } from "@/components/discover/PersonalizeSortButton";
import { PersonalizeProgressBar } from "@/components/discover/PersonalizeProgressBar";
import { useLibraryWatchedVisibility } from "@/components/providers/LibraryWatchedVisibilityProvider";
import { usePersonalizeBrowseStream } from "@/hooks/usePersonalizeBrowseStream";
import {
  HUNTARR_TITLE_HIDDEN_EVENT,
  matchesHiddenTitle,
  type TitleHiddenDetail,
} from "@/lib/hide-list/client";
import type { RecommendationItem, TmdbMediaItem } from "@/types";

interface PersonalizedBrowseRowProps {
  title: string;
  initialItems: TmdbMediaItem[];
  /** Label for the default sort order, e.g. "global trending" or "popularity". */
  defaultOrderLabel?: string;
}

export function PersonalizedBrowseRow({
  title,
  initialItems,
  defaultOrderLabel = "default",
}: PersonalizedBrowseRowProps) {
  const { filterVisibleItems } = useLibraryWatchedVisibility();
  const {
    personalized,
    items: personalizedItems,
    loading,
    initializing,
    progress,
    revealedCount,
    run,
    activateCached,
    deactivate,
    setItems,
  } = usePersonalizeBrowseStream({ mode: "home" });

  const [localInitialItems, setLocalInitialItems] = useState(initialItems);

  useEffect(() => {
    setLocalInitialItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    function onTitleHidden(event: Event) {
      const detail = (event as CustomEvent<TitleHiddenDetail>).detail;
      if (!detail) return;
      setLocalInitialItems((prev) => prev.filter((item) => !matchesHiddenTitle(item, detail)));
      setItems((prev) => (prev ? prev.filter((item) => !matchesHiddenTitle(item, detail)) : prev));
    }
    window.addEventListener(HUNTARR_TITLE_HIDDEN_EVENT, onTitleHidden);
    return () => window.removeEventListener(HUNTARR_TITLE_HIDDEN_EVENT, onTitleHidden);
  }, [setItems]);

  const sortedItems = useMemo(
    () => (personalized ? (personalizedItems ?? []) : localInitialItems),
    [personalized, personalizedItems, localInitialItems]
  );
  const visibleItems = useMemo(
    () => filterVisibleItems(sortedItems as RecommendationItem[]),
    [sortedItems, filterVisibleItems]
  );

  const isRollingOut = personalized && initializing;
  const slotTotal = isRollingOut
    ? Math.max(localInitialItems.length, visibleItems.length)
    : visibleItems.length;
  const revealed = isRollingOut ? visibleItems.slice(0, revealedCount) : visibleItems;
  const skeletonCount = isRollingOut ? Math.max(0, slotTotal - revealedCount) : 0;

  if (localInitialItems.length === 0) return null;

  async function togglePersonalized() {
    if (personalized) {
      deactivate();
      return;
    }

    if (personalizedItems) {
      activateCached();
      return;
    }

    try {
      await run(localInitialItems as RecommendationItem[]);
    } catch {
      // Silent fail on home rows
    }
  }

  return (
    <section className="mb-5 md:mb-10" aria-busy={loading}>
      <div className="mb-2 flex items-center gap-2 px-4 md:mb-4 md:px-8">
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        <PersonalizeSortButton
          active={personalized}
          loading={loading}
          onToggle={togglePersonalized}
          defaultOrderLabel={defaultOrderLabel}
        />
      </div>
      {personalized && !isRollingOut && (
        <p className="mb-2 px-4 text-sm text-gray-600 md:mb-4 md:px-8">
          Sorted by your taste — same AI scoring as For You
        </p>
      )}
      {isRollingOut && (
        <div className="mb-2 px-4 md:mb-4 md:px-8">
          <PersonalizeProgressBar
            ranked={progress?.ranked ?? 0}
            total={progress?.total ?? localInitialItems.length}
            done={false}
            indeterminate={!progress?.ranked}
          />
        </div>
      )}
      <HorizontalScrollRow className="px-4 pb-2 md:px-8 md:pb-4">
        {Array.from({ length: slotTotal }).map((_, index) => {
          if (index < revealed.length) {
            const item = revealed[index];
            return (
              <MediaCard
                key={item.id}
                item={item}
                showReason={personalized}
                onHidden={() => {
                  setLocalInitialItems((prev) => prev.filter((entry) => entry.id !== item.id));
                  setItems((prev) => (prev ? prev.filter((entry) => entry.id !== item.id) : prev));
                }}
              />
            );
          }

          if (isRollingOut && index < revealed.length + skeletonCount) {
            return <PosterSkeleton key={`personalize-skeleton-${index}`} />;
          }

          return null;
        })}
      </HorizontalScrollRow>
    </section>
  );
}
