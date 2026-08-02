import {
  enrichItemsWithStatus,
  getStatusIdSets,
  withoutFullyWatchedItems,
} from "@/lib/recommendations/filters";
import type { MediaType, RecommendationItem, TmdbMediaItem } from "@/types";

export const DETAIL_RELATED_LIMIT = 20;

export function extractRelatedFromDetails(
  details: Record<string, unknown>,
  key: "recommendations" | "similar"
): TmdbMediaItem[] {
  const block = details[key] as { results?: TmdbMediaItem[] } | undefined;
  return block?.results ?? [];
}

export function normalizeRelatedItems(
  items: TmdbMediaItem[],
  mediaType: MediaType,
  excludeId: number,
  limit = DETAIL_RELATED_LIMIT
): TmdbMediaItem[] {
  return items
    .filter((item) => item.id !== excludeId && (item.poster_path || item.title || item.name))
    .map((item) => ({ ...item, media_type: mediaType }))
    .slice(0, limit);
}

export async function getDetailRelatedItems(
  details: Record<string, unknown>,
  mediaType: MediaType,
  tmdbId: number,
  userId: string,
  tautulliUsernames: string[] = []
): Promise<{ recommendations: RecommendationItem[]; similar: RecommendationItem[] }> {
  const statusSets = await getStatusIdSets(userId, tautulliUsernames);

  const recommendations = withoutFullyWatchedItems(
    enrichItemsWithStatus(
      normalizeRelatedItems(
        extractRelatedFromDetails(details, "recommendations"),
        mediaType,
        tmdbId
      ),
      statusSets
    ),
    statusSets.fullyWatchedIds
  );
  const similar = enrichItemsWithStatus(
    normalizeRelatedItems(
      extractRelatedFromDetails(details, "similar"),
      mediaType,
      tmdbId
    ),
    statusSets
  );

  return { recommendations, similar };
}
