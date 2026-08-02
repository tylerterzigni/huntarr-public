"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { HOME_ROW_LIMIT } from "@/lib/recommendations/constants";
import {
  filterByLibraryAndWatchedVisibility,
  isLibraryOrWatchedItem,
  selectVisibleRowItems,
} from "@/lib/recommendations/visibility-filter";
import type { RecommendationItem } from "@/types";

const STORAGE_KEY = "huntarr-hide-library-watched";

type LibraryWatchedVisibilityContextValue = {
  /** When true, library and watched titles are hidden from browse rows. */
  hideLibraryAndWatched: boolean;
  toggleHideLibraryAndWatched: () => void;
  /** Filter only — use for grids that should show every remaining item. */
  filterVisibleItems: <T extends RecommendationItem>(items: T[]) => T[];
  /**
   * Filter then cap to `limit`, backfilling from later pool items when
   * library/watched titles are hidden so horizontal rows stay full.
   */
  selectVisibleRowItems: <T extends RecommendationItem>(items: T[], limit?: number) => T[];
};

const LibraryWatchedVisibilityContext =
  createContext<LibraryWatchedVisibilityContextValue | null>(null);

function readStoredPreference(): boolean {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "false") return false;
  if (stored === "true") return true;
  return true;
}

export function LibraryWatchedVisibilityProvider({ children }: { children: ReactNode }) {
  const [hideLibraryAndWatched, setHideLibraryAndWatched] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHideLibraryAndWatched(readStoredPreference());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, String(hideLibraryAndWatched));
  }, [hideLibraryAndWatched, hydrated]);

  const toggleHideLibraryAndWatched = useCallback(() => {
    setHideLibraryAndWatched((prev) => !prev);
  }, []);

  const filterVisibleItems = useCallback(
    <T extends RecommendationItem>(items: T[]) =>
      filterByLibraryAndWatchedVisibility(items, hideLibraryAndWatched),
    [hideLibraryAndWatched]
  );

  const selectVisibleRow = useCallback(
    <T extends RecommendationItem>(items: T[], limit: number = HOME_ROW_LIMIT) =>
      selectVisibleRowItems(items, hideLibraryAndWatched, limit),
    [hideLibraryAndWatched]
  );

  const value = useMemo(
    () => ({
      hideLibraryAndWatched,
      toggleHideLibraryAndWatched,
      filterVisibleItems,
      selectVisibleRowItems: selectVisibleRow,
    }),
    [hideLibraryAndWatched, toggleHideLibraryAndWatched, filterVisibleItems, selectVisibleRow]
  );

  return (
    <LibraryWatchedVisibilityContext.Provider value={value}>
      {children}
    </LibraryWatchedVisibilityContext.Provider>
  );
}

export function useLibraryWatchedVisibility() {
  const ctx = useContext(LibraryWatchedVisibilityContext);
  if (!ctx) {
    throw new Error("useLibraryWatchedVisibility must be used within LibraryWatchedVisibilityProvider");
  }
  return ctx;
}

export { isLibraryOrWatchedItem };
