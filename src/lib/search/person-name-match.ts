import {
  scoreTextMatch,
  textsLikelyMatch,
  type TextMatchOptions,
} from "@/lib/search/fuzzy-text-match";

const PERSON_MATCH: TextMatchOptions = { mode: "person" };

export function personNamesLikelyMatch(query: string, candidate: string): boolean {
  return textsLikelyMatch(query, candidate, PERSON_MATCH);
}

export function scorePersonNameMatch(query: string, candidate: string): number {
  return scoreTextMatch(query, candidate, PERSON_MATCH);
}
