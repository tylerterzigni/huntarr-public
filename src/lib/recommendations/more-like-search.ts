import {
  fetchSimilarAndRecommendedFromSeed,
  type SimilarSeedSource,
} from "@/lib/recommendations/similar-from-seed";
import { HOME_ROW_POOL_LIMIT } from "@/lib/recommendations/constants";
import type { SearchCriteria, TmdbMediaItem } from "@/types";

/** Sources for chat “like X” cards — same TMDB endpoints as Because you watched. */
export type MoreLikeSource = SimilarSeedSource;

export interface MoreLikeBrowseResult {
  items: TmdbMediaItem[];
  itemSources: Map<number, MoreLikeSource>;
}

/**
 * Chat “shows/movies like X” uses the same similar + recommendations lookup
 * as the home “Because you watched” row (not franchise/creator/genre expansion).
 */
export async function browseMoreLikeMedia(
  criteria: SearchCriteria
): Promise<MoreLikeBrowseResult> {
  if (!criteria.moreLike) {
    return { items: [], itemSources: new Map() };
  }

  const { mediaType, tmdbId } = criteria.moreLike;
  return fetchSimilarAndRecommendedFromSeed(mediaType, tmdbId, {
    limit: HOME_ROW_POOL_LIMIT,
    prefer: "recommendations-first",
  });
}

/** @deprecated Use browseMoreLikeMedia */
export async function browseMoreLikeShows(criteria: SearchCriteria): Promise<TmdbMediaItem[]> {
  return (await browseMoreLikeMedia(criteria)).items;
}

export function buildMoreLikeReason(
  _item: TmdbMediaItem,
  anchorTitle: string,
  source?: MoreLikeSource
): string {
  if (source === "recommendation") {
    return `Recommended if you liked ${anchorTitle}`;
  }
  return `Similar to ${anchorTitle}`;
}
