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
import {
  filterByLibraryAndWatchedVisibility,
  isLibraryOrWatchedItem,
} from "@/lib/recommendations/visibility-filter";
import type { RecommendationItem } from "@/types";

const STORAGE_KEY = "huntarr-hide-library-watched";

type LibraryWatchedVisibilityContextValue = {
  /** When true, library and watched titles are hidden from browse rows. */
  hideLibraryAndWatched: boolean;
  toggleHideLibraryAndWatched: () => void;
  filterVisibleItems: <T extends RecommendationItem>(items: T[]) => T[];
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

  const value = useMemo(
    () => ({
      hideLibraryAndWatched,
      toggleHideLibraryAndWatched,
      filterVisibleItems,
    }),
    [hideLibraryAndWatched, toggleHideLibraryAndWatched, filterVisibleItems]
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
