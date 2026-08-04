import {
  getRecommendations,
  getSimilar,
} from "@/lib/integrations/tmdb/client";
import { prioritizeHomeLocaleItems } from "@/lib/recommendations/locale-priority";
import { mediaItemKey } from "@/lib/integrations/tmdb/helpers";
import type { MediaType, TmdbMediaItem } from "@/types";

export type SimilarSeedSource = "similar" | "recommendation";

export type SimilarSeedPrefer = "similar-first" | "recommendations-first";

export interface SimilarFromSeedResult {
  items: TmdbMediaItem[];
  itemSources: Map<number, SimilarSeedSource>;
}

/**
 * TMDB similar + recommendations for a seed title (Because you watched / chat “like X”).
 * Default order matches Because you watched; chat can prefer recommendations first.
 */
export async function fetchSimilarAndRecommendedFromSeed(
  mediaType: MediaType,
  tmdbId: number,
  options: {
    limit?: number;
    excludeSeed?: boolean;
    prefer?: SimilarSeedPrefer;
  } = {}
): Promise<SimilarFromSeedResult> {
  const excludeSeed = options.excludeSeed !== false;
  const prefer = options.prefer ?? "similar-first";
  const itemSources = new Map<number, SimilarSeedSource>();

  const [similarPage1, similarPage2, recsPage1, recsPage2] = await Promise.all([
    getSimilar(mediaType, tmdbId, 1),
    getSimilar(mediaType, tmdbId, 2).catch(() => ({
      results: [] as TmdbMediaItem[],
    })),
    getRecommendations(mediaType, tmdbId, 1),
    getRecommendations(mediaType, tmdbId, 2).catch(() => ({
      results: [] as TmdbMediaItem[],
    })),
  ]);

  const seedKey = `${mediaType}:${tmdbId}`;
  const seen = new Set<string>();
  const ordered: TmdbMediaItem[] = [];

  const append = (items: TmdbMediaItem[], source: SimilarSeedSource) => {
    for (const item of items) {
      const tagged = { ...item, media_type: mediaType };
      const key = mediaItemKey(tagged);
      if (excludeSeed && key === seedKey) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      ordered.push(tagged);
      if (!itemSources.has(tagged.id)) {
        itemSources.set(tagged.id, source);
      }
    }
  };

  if (prefer === "recommendations-first") {
    // Chat “like X”: recommendations before similar
    append(recsPage1.results, "recommendation");
    append(recsPage2.results, "recommendation");
    append(similarPage1.results, "similar");
    append(similarPage2.results, "similar");
  } else {
    // Because you watched: similar p1 → recs p1 → similar p2 → recs p2
    append(similarPage1.results, "similar");
    append(recsPage1.results, "recommendation");
    append(similarPage2.results, "similar");
    append(recsPage2.results, "recommendation");
  }

  const items = prioritizeHomeLocaleItems(ordered, options.limit);
  return { items, itemSources };
}
