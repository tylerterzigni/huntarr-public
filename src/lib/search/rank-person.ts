import { scorePersonNameMatch } from "@/lib/search/person-name-match";
import type { TmdbPersonSearchResult } from "@/types";

function scorePersonMatch(query: string, person: TmdbPersonSearchResult): number {
  const nameScore = scorePersonNameMatch(query, person.name);
  if (nameScore < 0) return -1;

  let score = (person.popularity ?? 0) + nameScore;

  if (person.profile_path) score += 100;
  if (person.known_for?.length) score += person.known_for.length * 10;

  return score;
}
export function pickBestPersonMatch(
  query: string,
  people: TmdbPersonSearchResult[]
): TmdbPersonSearchResult | null {
  let best: TmdbPersonSearchResult | null = null;
  let bestScore = -1;

  for (const person of people) {
    const score = scorePersonMatch(query, person);
    if (score > bestScore) {
      best = person;
      bestScore = score;
    }
  }

  return best;
}
