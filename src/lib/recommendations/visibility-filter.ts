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
