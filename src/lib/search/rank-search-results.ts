import { getMediaTitle } from "@/lib/integrations/tmdb/helpers";
import { localePriorityScore } from "@/lib/recommendations/locale-priority";
import { pickBestTextMatch, scoreTextMatch } from "@/lib/search/fuzzy-text-match";
import type { TmdbMediaItem } from "@/types";

const TITLE_MATCH = { mode: "title" as const };

export function titleMatchScore(query: string, title: string): number {
  return scoreTextMatch(query, title, TITLE_MATCH);
}

export function searchRelevanceScore(query: string, item: TmdbMediaItem): number {
  const title = getMediaTitle(item);
  let score = item.popularity ?? 0;

  const matchScore = titleMatchScore(query, title);
  if (matchScore >= 0) {
    score += matchScore;
  }

  score += localePriorityScore(item) * 1_000;

  return score;
}

export function sortSearchResults<T extends TmdbMediaItem>(query: string, items: T[]): T[] {
  return [...items].sort(
    (a, b) => searchRelevanceScore(query, b) - searchRelevanceScore(query, a)
  );
}

export function pickBestMediaMatch(
  query: string,
  items: TmdbMediaItem[]
): TmdbMediaItem | null {
  return pickBestTextMatch(
    query,
    items,
    (item) => getMediaTitle(item),
    (item) => {
      // Prefer well-known titles when names tie (e.g. Shrinking TV vs obscure movies).
      const popularity = item.popularity ?? 0;
      const votes = item.vote_count ?? 0;
      const locale = localePriorityScore(item) * 50;
      return popularity + Math.min(votes, 5_000) * 0.05 + locale;
    },
    TITLE_MATCH
  );
}
