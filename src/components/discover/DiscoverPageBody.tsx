"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { MediaCard } from "@/components/media/MediaCard";
import { PosterSkeleton } from "@/components/media/PosterSkeleton";
import { Button } from "@/components/ui/button";
import { PersonalizeSortButton } from "@/components/discover/PersonalizeSortButton";
import { PersonalizeProgressBar } from "@/components/discover/PersonalizeProgressBar";
import { useLibraryWatchedVisibility } from "@/components/providers/LibraryWatchedVisibilityProvider";
import { serializeDiscoverParams } from "@/components/discover/filter-utils";
import { usePersonalizeBrowseStream } from "@/hooks/usePersonalizeBrowseStream";
import {
  HUNTARR_TITLE_HIDDEN_EVENT,
  matchesHiddenTitle,
  type TitleHiddenDetail,
} from "@/lib/hide-list/client";
import type { MediaType, RecommendationItem } from "@/types";

interface DiscoverPageBodyProps {
  title: string;
  mediaType: MediaType;
  initialItems: RecommendationItem[];
  filterParams: Record<string, string | undefined>;
  /** TMDB pages already loaded into initialItems (e.g. 2 ≈ 40 titles). */
  initialPagesLoaded: number;
  totalPages: number;
  filters: ReactNode;
}

export function DiscoverPageBody({
  title,
  mediaType,
  initialItems,
  filterParams,
  initialPagesLoaded,
  totalPages: initialTotalPages,
  filters,
}: DiscoverPageBodyProps) {
  const { filterVisibleItems, hideLibraryAndWatched } = useLibraryWatchedVisibility();
  const [discoverItems, setDiscoverItems] = useState(initialItems);
  const [page, setPage] = useState(initialPagesLoaded);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");

  const {
    personalized,
    items: personalizedItems,
    loading: personalizeLoading,
    initializing: personalizeInitializing,
    progress: personalizeProgress,
    error: personalizeError,
    revealedCount,
    run: runPersonalize,
    activateCached,
    deactivate,
    setItems: setPersonalizedItems,
    setError: setPersonalizeError,
  } = usePersonalizeBrowseStream({ mode: "discover" });

  useEffect(() => {
    function onTitleHidden(event: Event) {
      const detail = (event as CustomEvent<TitleHiddenDetail>).detail;
      if (!detail) return;
      setDiscoverItems((prev) => prev.filter((item) => !matchesHiddenTitle(item, detail)));
      setPersonalizedItems((prev) =>
        prev ? prev.filter((item) => !matchesHiddenTitle(item, detail)) : prev
      );
    }
    window.addEventListener(HUNTARR_TITLE_HIDDEN_EVENT, onTitleHidden);
    return () => window.removeEventListener(HUNTARR_TITLE_HIDDEN_EVENT, onTitleHidden);
  }, [setPersonalizedItems]);

  const queryString = serializeDiscoverParams(filterParams);
  const sortedItems = useMemo(
    () => (personalized ? (personalizedItems ?? []) : discoverItems),
    [personalized, personalizedItems, discoverItems]
  );
  const visibleSortedItems = useMemo(
    () => filterVisibleItems(sortedItems),
    [sortedItems, filterVisibleItems]
  );

  const isRollingOut = personalized && personalizeInitializing;
  const slotTotal = isRollingOut
    ? Math.max(discoverItems.length, visibleSortedItems.length)
    : visibleSortedItems.length;
  const revealedItems = isRollingOut
    ? visibleSortedItems.slice(0, revealedCount)
    : visibleSortedItems;
  const skeletonCount = isRollingOut ? Math.max(0, slotTotal - revealedCount) : 0;

  const togglePersonalized = useCallback(async () => {
    if (personalized) {
      deactivate();
      return;
    }

    if (personalizedItems) {
      activateCached();
      return;
    }

    try {
      await runPersonalize(discoverItems);
    } catch {
      // Error surfaced via personalizeError
    }
  }, [personalized, personalizedItems, discoverItems, runPersonalize, deactivate, activateCached]);

  const loadMore = useCallback(async () => {
    const nextPage = page + 1;
    if (nextPage > totalPages || loadingMore) return;

    setLoadingMore(true);
    setLoadMoreError("");

    const params = new URLSearchParams(queryString);
    params.set("type", mediaType);
    params.set("page", String(nextPage));

    try {
      const res = await fetch(`/api/discover?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load more");

      let mergedDiscover: RecommendationItem[] = [];
      setDiscoverItems((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        const nextItems = (data.results ?? []).filter(
          (item: RecommendationItem) => !seen.has(item.id)
        );
        mergedDiscover = [...prev, ...nextItems];
        return mergedDiscover;
      });

      setPage(nextPage);
      setTotalPages(data.total_pages ?? totalPages);

      if (personalized) {
        setPersonalizeError("");
        try {
          await runPersonalize(mergedDiscover);
        } catch (err) {
          setPersonalizeError(
            err instanceof Error ? err.message : "Failed to personalize results"
          );
        }
      }
    } catch (err) {
      setLoadMoreError(err instanceof Error ? err.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }, [
    page,
    totalPages,
    loadingMore,
    queryString,
    mediaType,
    personalized,
    runPersonalize,
    setPersonalizeError,
  ]);

  if (discoverItems.length === 0) {
    return (
      <>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{title}</h1>
            <PersonalizeSortButton
              active={personalized}
              loading={personalizeLoading}
              onToggle={togglePersonalized}
              defaultOrderLabel="popularity"
            />
          </div>
          {filters}
        </div>
        <p className="mt-6 text-muted-foreground">No results match the selected filters.</p>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{title}</h1>
          <PersonalizeSortButton
            active={personalized}
            loading={personalizeLoading}
            onToggle={togglePersonalized}
            defaultOrderLabel="popularity"
          />
        </div>
        {filters}
      </div>

      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          {personalized
            ? isRollingOut
              ? `Personalizing ${mediaType === "movie" ? "movies" : "TV shows"} for you…`
              : `Showing ${revealedItems.length} ${mediaType === "movie" ? "movies" : "TV shows"} sorted by your taste`
            : `Showing ${revealedItems.length} ${mediaType === "movie" ? "movies" : "TV shows"}`}
          {hideLibraryAndWatched && sortedItems.length > visibleSortedItems.length
            ? ` (${sortedItems.length - visibleSortedItems.length} in library or watched hidden)`
            : ""}
        </p>
        {visibleSortedItems.length === 0 && sortedItems.length > 0 && (
          <p className="text-sm text-muted-foreground">
            All results are in your library or watched list. Use the &quot;Owned&quot; toggle in
            the header to show them.
          </p>
        )}
        {personalizeError && <p className="text-red-400 text-sm">{personalizeError}</p>}
        {isRollingOut && (
          <PersonalizeProgressBar
            ranked={personalizeProgress?.ranked ?? 0}
            total={personalizeProgress?.total ?? discoverItems.length}
            done={false}
            indeterminate={!personalizeProgress?.ranked}
          />
        )}
        <div className="grid grid-cols-[repeat(auto-fill,160px)] justify-start gap-x-4 gap-y-6">
          {revealedItems.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              layout="grid"
              className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both"
              showReason={personalized}
              onHidden={() => {
                setDiscoverItems((prev) => prev.filter((entry) => entry.id !== item.id));
                setPersonalizedItems((prev) =>
                  prev ? prev.filter((entry) => entry.id !== item.id) : prev
                );
              }}
            />
          ))}
          {Array.from({ length: skeletonCount }).map((_, index) => (
            <PosterSkeleton key={`personalize-skeleton-${index}`} layout="grid" />
          ))}
        </div>
        {loadMoreError && <p className="text-red-400 text-sm">{loadMoreError}</p>}
        {page < totalPages && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={loadMore} disabled={loadingMore || personalizeLoading}>
              {loadingMore ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                "Load more"
              )}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
