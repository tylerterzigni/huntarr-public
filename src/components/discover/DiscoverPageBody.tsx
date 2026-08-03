"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { HUNTARR_REFRESH_EVENT } from "@/lib/pwa/refresh";
import {
  DISCOVER_MAX_PAGES,
  DISCOVER_ROLL_PAGES,
} from "@/lib/recommendations/constants";
import type { MediaType, RecommendationItem } from "@/types";

/** Keep mobile discover grids smaller — large decoded poster sets OOM WebKit. */
const DISCOVER_MAX_PAGES_MOBILE = 12;

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
  const filterKey = serializeDiscoverParams(filterParams);
  const [discoverItems, setDiscoverItems] = useState(initialItems);
  const [page, setPage] = useState(initialPagesLoaded);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");
  const [retryToken, setRetryToken] = useState(0);
  /** Person clicked before any titles arrived — wait until the roll has items. */
  const [personalizeWhenReady, setPersonalizeWhenReady] = useState(false);
  const rollGenerationRef = useRef(0);
  const personalizedRef = useRef(false);
  /** Independent of React state so roll completions cannot race a pending click. */
  const personalizeWhenReadyRef = useRef(false);
  /** Re-personalize with the full list once the TMDB roll finishes. */
  const refreshPersonalizeOnRollCompleteRef = useRef(false);
  const discoverItemsRef = useRef(initialItems);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(false);
  const initialItemsRef = useRef(initialItems);
  const initialPagesLoadedRef = useRef(initialPagesLoaded);
  const initialTotalPagesRef = useRef(initialTotalPages);
  const [maxPages, setMaxPages] = useState(DISCOVER_MAX_PAGES);

  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setMaxPages(DISCOVER_MAX_PAGES_MOBILE);
    }
  }, []);

  initialItemsRef.current = initialItems;
  initialPagesLoadedRef.current = initialPagesLoaded;
  initialTotalPagesRef.current = initialTotalPages;
  discoverItemsRef.current = discoverItems;
  loadingMoreRef.current = loadingMore;

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
    reset: resetPersonalize,
    setItems: setPersonalizedItems,
    setError: setPersonalizeError,
  } = usePersonalizeBrowseStream({ mode: "discover" });

  personalizedRef.current = personalized;

  const clearPersonalizeWhenReady = useCallback(() => {
    personalizeWhenReadyRef.current = false;
    setPersonalizeWhenReady(false);
  }, []);

  const resetPersonalizeIntent = useCallback(() => {
    clearPersonalizeWhenReady();
    refreshPersonalizeOnRollCompleteRef.current = false;
    resetPersonalize();
  }, [clearPersonalizeWhenReady, resetPersonalize]);

  const resetDiscoverGrid = useCallback(() => {
    rollGenerationRef.current += 1;
    setDiscoverItems(initialItemsRef.current);
    setPage(initialPagesLoadedRef.current);
    setTotalPages(initialTotalPagesRef.current);
    setLoadMoreError("");
    setLoadingMore(false);
    resetPersonalizeIntent();
  }, [resetPersonalizeIntent]);

  // Sync grid when filters change without remounting (keeps filters sidebar open).
  useEffect(() => {
    resetDiscoverGrid();
  }, [filterKey, resetDiscoverGrid]);

  // Pull-to-refresh / logo refresh: abort the auto-roll and drop back to SSR items
  // so we do not keep growing the grid while router.refresh() reloads the page.
  useEffect(() => {
    const onRefresh = () => resetDiscoverGrid();
    window.addEventListener(HUNTARR_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(HUNTARR_REFRESH_EVENT, onRefresh);
  }, [resetDiscoverGrid]);

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

  const sortedItems = useMemo(
    () => (personalized ? (personalizedItems ?? []) : discoverItems),
    [personalized, personalizedItems, discoverItems]
  );
  const visibleSortedItems = useMemo(
    () => filterVisibleItems(sortedItems),
    [sortedItems, filterVisibleItems]
  );

  const isRollingOut = personalized && personalizeInitializing;
  const pageCap = Math.min(totalPages, maxPages);
  const hasMore = page < pageCap;
  hasMoreRef.current = hasMore;
  const stillLoadingDiscover = hasMore || loadingMore;
  const slotTotal = isRollingOut
    ? Math.max(discoverItems.length, visibleSortedItems.length)
    : visibleSortedItems.length;
  const revealedItems = isRollingOut
    ? visibleSortedItems.slice(0, revealedCount)
    : visibleSortedItems;
  const skeletonCount = isRollingOut ? Math.max(0, slotTotal - revealedCount) : 0;

  const runPersonalizeSafe = useCallback(
    async (items: RecommendationItem[]) => {
      if (items.length === 0) return false;
      setPersonalizeError("");
      try {
        await runPersonalize(items);
        return true;
      } catch {
        // Error surfaced via personalizeError
        return false;
      }
    },
    [runPersonalize, setPersonalizeError]
  );

  const togglePersonalized = useCallback(async () => {
    if (personalized) {
      refreshPersonalizeOnRollCompleteRef.current = false;
      deactivate();
      return;
    }

    if (personalizeWhenReadyRef.current) {
      clearPersonalizeWhenReady();
      refreshPersonalizeOnRollCompleteRef.current = false;
      return;
    }

    if (personalizedItems) {
      activateCached();
      return;
    }

    const currentItems = discoverItemsRef.current;
    const loading = hasMoreRef.current || loadingMoreRef.current;

    // Titles already on screen — personalize them now. If the roll is still going,
    // refresh once with the full list when it finishes.
    if (currentItems.length > 0) {
      if (loading) {
        refreshPersonalizeOnRollCompleteRef.current = true;
      }
      await runPersonalizeSafe(currentItems);
      return;
    }

    // Nothing loaded yet but TMDB pages are still rolling in — wait for the first batch.
    if (loading) {
      setPersonalizeError("");
      personalizeWhenReadyRef.current = true;
      refreshPersonalizeOnRollCompleteRef.current = true;
      setPersonalizeWhenReady(true);
      return;
    }

    setPersonalizeError("No results to personalize.");
  }, [
    personalized,
    personalizedItems,
    runPersonalizeSafe,
    deactivate,
    activateCached,
    clearPersonalizeWhenReady,
    setPersonalizeError,
  ]);

  // Auto-roll remaining TMDB pages in large multi-page batches until complete.
  useEffect(() => {
    if (!hasMore || loadMoreError) return;

    const generation = rollGenerationRef.current;
    const abort = new AbortController();
    let cancelled = false;

    async function rollNextBatch() {
      const startPage = page + 1;
      if (startPage > pageCap) return;

      setLoadingMore(true);

      const batchSize = Math.min(DISCOVER_ROLL_PAGES, pageCap - page);
      const params = new URLSearchParams(filterKey);
      params.set("type", mediaType);
      params.set("startPage", String(startPage));
      params.set("pages", String(batchSize));

      try {
        const res = await fetch(`/api/discover?${params.toString()}`, {
          cache: "no-store",
          signal: abort.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load more");
        if (cancelled || generation !== rollGenerationRef.current) return;

        let mergedDiscover: RecommendationItem[] = [];
        setDiscoverItems((prev) => {
          const seen = new Set(prev.map((item) => item.id));
          const nextItems = (data.results ?? []).filter(
            (item: RecommendationItem) => !seen.has(item.id)
          );
          mergedDiscover = [...prev, ...nextItems];
          return mergedDiscover;
        });
        discoverItemsRef.current = mergedDiscover;

        const loadedThrough = Number(data.page) || Math.min(page + batchSize, pageCap);
        const nextTotal = data.total_pages ?? totalPages;
        setPage(loadedThrough);
        setTotalPages(nextTotal);

        const done = loadedThrough >= pageCap || loadedThrough >= nextTotal;
        const wantsPersonalize =
          personalizedRef.current ||
          personalizeWhenReadyRef.current ||
          refreshPersonalizeOnRollCompleteRef.current;

        // First titles arrived while Person was waiting on an empty grid.
        if (
          !done &&
          personalizeWhenReadyRef.current &&
          mergedDiscover.length > 0 &&
          !personalizedRef.current
        ) {
          clearPersonalizeWhenReady();
          await runPersonalizeSafe(mergedDiscover);
        }

        if (done && wantsPersonalize && mergedDiscover.length > 0) {
          clearPersonalizeWhenReady();
          refreshPersonalizeOnRollCompleteRef.current = false;
          await runPersonalizeSafe(mergedDiscover);
        }
      } catch (err) {
        if (abort.signal.aborted) return;
        if (!cancelled && generation === rollGenerationRef.current) {
          setLoadMoreError(err instanceof Error ? err.message : "Failed to load more");
        }
      } finally {
        if (!cancelled && generation === rollGenerationRef.current) {
          setLoadingMore(false);
        }
      }
    }

    void rollNextBatch();

    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [
    hasMore,
    page,
    pageCap,
    totalPages,
    filterKey,
    mediaType,
    loadMoreError,
    retryToken,
    runPersonalizeSafe,
    clearPersonalizeWhenReady,
  ]);

  // Pending Person click with an empty grid: start once titles exist, or once the roll stops.
  useEffect(() => {
    if (!personalizeWhenReadyRef.current) {
      if (personalizeWhenReady) setPersonalizeWhenReady(false);
      return;
    }
    if (personalized || personalizeLoading) return;

    if (discoverItems.length > 0) {
      clearPersonalizeWhenReady();
      // Still rolling — refresh again when the full set is in.
      if (stillLoadingDiscover) {
        refreshPersonalizeOnRollCompleteRef.current = true;
      }
      void runPersonalizeSafe(discoverItems);
      return;
    }

    // Still loading empty pages — keep waiting. Never error mid-roll.
    if (stillLoadingDiscover) return;

    clearPersonalizeWhenReady();
    refreshPersonalizeOnRollCompleteRef.current = false;
    setPersonalizeError(
      loadMoreError ? "Failed to load results to personalize." : "No results to personalize."
    );
  }, [
    personalizeWhenReady,
    discoverItems,
    stillLoadingDiscover,
    personalized,
    personalizeLoading,
    loadMoreError,
    runPersonalizeSafe,
    clearPersonalizeWhenReady,
    setPersonalizeError,
  ]);

  const personButtonActive = personalized || personalizeWhenReady;
  const personButtonLoading = personalizeLoading || personalizeWhenReady;

  if (discoverItems.length === 0 && !loadingMore) {
    return (
      <div data-huntarr-loading={stillLoadingDiscover ? "true" : undefined}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{title}</h1>
            <PersonalizeSortButton
              active={personButtonActive}
              loading={personButtonLoading}
              onToggle={togglePersonalized}
              defaultOrderLabel="popularity"
            />
          </div>
          {filters}
        </div>
        <p className="mt-6 text-muted-foreground">No results match the selected filters.</p>
        {personalizeError && <p className="mt-2 text-red-400 text-sm">{personalizeError}</p>}
      </div>
    );
  }

  return (
    <div data-huntarr-loading={stillLoadingDiscover || personalizeLoading ? "true" : undefined}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{title}</h1>
          <PersonalizeSortButton
            active={personButtonActive}
            loading={personButtonLoading}
            onToggle={togglePersonalized}
            defaultOrderLabel="popularity"
          />
        </div>
        {filters}
      </div>

      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          {personalizeWhenReady
            ? "Waiting for results before sorting by your taste…"
            : personalized
              ? isRollingOut
                ? `Personalizing ${mediaType === "movie" ? "movies" : "TV shows"} for you…`
                : `Showing ${revealedItems.length} ${mediaType === "movie" ? "movies" : "TV shows"} sorted by your taste`
              : `Showing ${revealedItems.length} ${mediaType === "movie" ? "movies" : "TV shows"}`}
          {stillLoadingDiscover && !personalizeWhenReady ? " · loading more…" : ""}
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
          {loadingMore &&
            !isRollingOut &&
            Array.from({ length: 10 }).map((_, index) => (
              <PosterSkeleton key={`roll-skeleton-${index}`} layout="grid" />
            ))}
        </div>
        {loadMoreError && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-red-400 text-sm">{loadMoreError}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLoadMoreError("");
                setRetryToken((token) => token + 1);
              }}
            >
              Retry
            </Button>
          </div>
        )}
        {loadingMore && !loadMoreError && (
          <div className="flex justify-center items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading more results…
          </div>
        )}
      </div>
    </div>
  );
}
