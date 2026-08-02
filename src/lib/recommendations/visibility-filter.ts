import type { RecommendationItem } from "@/types";

/** True when the item is in Plex/*arr or appears on the Tautulli watched list. */
export function isLibraryOrWatchedItem(item: RecommendationItem): boolean {
  return Boolean(item.inLibrary || item.watched || item.fullyWatched);
}

export function filterByLibraryAndWatchedVisibility<T extends RecommendationItem>(
  items: T[],
  hideLibraryAndWatched: boolean
): T[] {
  if (!hideLibraryAndWatched) return items;
  return items.filter((item) => !isLibraryOrWatchedItem(item));
}

/**
 * Pick posters for a horizontal row. When library/watched titles are hidden,
 * later pool items fill those slots up to `limit` instead of shortening the row.
 */
export function selectVisibleRowItems<T extends RecommendationItem>(
  items: T[],
  hideLibraryAndWatched: boolean,
  limit: number
): T[] {
  return filterByLibraryAndWatchedVisibility(items, hideLibraryAndWatched).slice(0, limit);
}
