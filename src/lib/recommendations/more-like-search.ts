import { getRecommendations, getSimilar, getMediaItemBrief } from "@/lib/integrations/tmdb/client";
import { normalizeRelatedItems } from "@/lib/integrations/tmdb/related";
import { inferMediaType } from "@/lib/integrations/tmdb/helpers";
import { filterItemsByDateCriteria } from "@/lib/search/date-criteria";
import type { SearchCriteria, TmdbMediaItem } from "@/types";

/** Sources for chat “like X” cards — matches title-detail Recommendations row. */
export type MoreLikeSource = "recommendation" | "similar";

export interface MoreLikeBrowseResult {
  items: TmdbMediaItem[];
  itemSources: Map<number, MoreLikeSource>;
}

/** Pages of TMDB recommendations to load (page 1 = title-detail Recommendations row). */
const CHAT_RECOMMENDATION_PAGES = 3;

async function filterByRuntime(
  items: TmdbMediaItem[],
  criteria: SearchCriteria
): Promise<TmdbMediaItem[]> {
  if (criteria.runtimeMin == null && criteria.runtimeMax == null) return items;

  const kept: TmdbMediaItem[] = [];
  // Parallelize in small batches to keep chat latency reasonable.
  const batchSize = 8;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const details = await Promise.all(
      batch.map(async (item) => {
        const mediaType = inferMediaType(item);
        const brief = await getMediaItemBrief(mediaType, item.id);
        return { item, runtime: brief?.runtime ?? null };
      })
    );
    for (const { item, runtime } of details) {
      if (runtime == null) continue;
      if (criteria.runtimeMin != null && runtime < criteria.runtimeMin) continue;
      if (criteria.runtimeMax != null && runtime > criteria.runtimeMax) continue;
      kept.push(item);
    }
  }
  return kept;
}

/**
 * Chat “shows/movies like X” uses the same TMDB recommendations feed as the
 * title-detail “Recommendations” row — same endpoint and order — then extra
 * recommendation pages for “show me more”. Similar is only a fallback if recs
 * are empty. Optional runtime and date filters are applied after fetch.
 */
export async function browseMoreLikeMedia(
  criteria: SearchCriteria
): Promise<MoreLikeBrowseResult> {
  if (!criteria.moreLike) {
    return { items: [], itemSources: new Map() };
  }

  const { mediaType, tmdbId } = criteria.moreLike;
  const itemSources = new Map<number, MoreLikeSource>();
  const seen = new Set<number>();
  const ordered: TmdbMediaItem[] = [];

  const append = (items: TmdbMediaItem[], source: MoreLikeSource) => {
    for (const item of normalizeRelatedItems(items, mediaType, tmdbId, items.length)) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      ordered.push(item);
      itemSources.set(item.id, source);
    }
  };

  for (let page = 1; page <= CHAT_RECOMMENDATION_PAGES; page++) {
    try {
      const data = await getRecommendations(mediaType, tmdbId, page);
      append(data.results, "recommendation");
      if (page >= (data.total_pages || 1)) break;
    } catch {
      break;
    }
  }

  // Title detail shows Similar as a separate row; only use it when recs are empty.
  if (ordered.length === 0) {
    try {
      const similar = await getSimilar(mediaType, tmdbId, 1);
      append(similar.results, "similar");
    } catch {
      // ignore
    }
  }

  const runtimeFiltered = await filterByRuntime(ordered, criteria);
  const filtered = filterItemsByDateCriteria(runtimeFiltered, criteria);
  const survivorIds = new Set(filtered.map((item) => item.id));
  for (const id of [...itemSources.keys()]) {
    if (!survivorIds.has(id)) itemSources.delete(id);
  }

  return { items: filtered, itemSources };
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
  if (source === "similar") {
    return `Similar to ${anchorTitle}`;
  }
  return `Recommended if you liked ${anchorTitle}`;
}
