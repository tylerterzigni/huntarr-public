import {
  DEFAULT_DISCOVER_COUNTRIES,
  DEFAULT_DISCOVER_LANGUAGE,
} from "@/lib/discover/constants";
import type { TmdbMediaItem } from "@/types";

const PREFERRED_LANGUAGE = DEFAULT_DISCOVER_LANGUAGE;
const PREFERRED_ORIGINS = new Set<string>(DEFAULT_DISCOVER_COUNTRIES);

/** Minimum TMDB rating for non-US/UK titles kept on home rows. */
export const US_TOP_RATED_MIN_VOTE_AVERAGE = 7.5;

/** Minimum vote count so foreign hits reflect real US/global breakout attention. */
export const US_TOP_RATED_MIN_VOTE_COUNT = 1_000;

/** Over-fetch multiplier so home rows stay full after locale filtering. */
export const HOME_LOCALE_FETCH_MULTIPLIER = 3;

function hasOrigin(item: TmdbMediaItem, code: string): boolean {
  return (item.origin_country ?? []).includes(code);
}

function isEnglish(item: TmdbMediaItem): boolean {
  return item.original_language?.toLowerCase() === PREFERRED_LANGUAGE;
}

function originCountries(item: TmdbMediaItem): string[] {
  return item.origin_country ?? [];
}

/** US or UK English — or English when TMDB omitted origin (common on movie lists). */
export function isPreferredHomeLocale(item: TmdbMediaItem): boolean {
  if (!isEnglish(item)) return false;

  if (hasOrigin(item, "US") || hasOrigin(item, "GB")) return true;

  const countries = originCountries(item);
  // Movie popular/trending often omit origin_country; English is the stand-in.
  return countries.length === 0;
}

/**
 * Non-preferred titles only appear when they are clearly top-rated breakouts
 * (e.g. Squid Game / Parasite-level attention in the US market).
 */
export function isUsTopRatedHit(item: TmdbMediaItem): boolean {
  return (
    (item.vote_average ?? 0) >= US_TOP_RATED_MIN_VOTE_AVERAGE &&
    (item.vote_count ?? 0) >= US_TOP_RATED_MIN_VOTE_COUNT
  );
}

export function passesHomeLocaleFilter(item: TmdbMediaItem): boolean {
  return isPreferredHomeLocale(item) || isUsTopRatedHit(item);
}

/** Sort tier: US English → UK English → other preferred English → US top-rated foreign. */
export function homeLocaleSortTier(item: TmdbMediaItem): number {
  if (isEnglish(item) && hasOrigin(item, "US")) return 0;
  if (isEnglish(item) && hasOrigin(item, "GB")) return 1;
  if (isPreferredHomeLocale(item)) return 2;
  if (isUsTopRatedHit(item)) return 3;
  return 4;
}

/** Boost US/UK English titles in personalized scoring. */
export function localePriorityScore(item: TmdbMediaItem): number {
  let score = 0;

  if (isEnglish(item)) {
    score += 4;
  }

  for (const country of originCountries(item)) {
    if (country === "US") score += 5;
    else if (country === "GB") score += 3;
  }

  return score;
}

export function compareByLocalePreference(a: TmdbMediaItem, b: TmdbMediaItem): number {
  const tierDiff = homeLocaleSortTier(a) - homeLocaleSortTier(b);
  if (tierDiff !== 0) return tierDiff;
  return localePriorityScore(b) - localePriorityScore(a);
}

export function sortByLocalePreference<T extends TmdbMediaItem>(items: T[]): T[] {
  return [...items].sort(compareByLocalePreference);
}

/**
 * Home-row ordering: drop non-US/UK/non-English unless US top-rated,
 * then US → UK → English → breakout foreign, preserving relative TMDB order in-tier.
 */
export function prioritizeHomeLocaleItems<T extends TmdbMediaItem>(
  items: T[],
  limit?: number
): T[] {
  const filtered = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => passesHomeLocaleFilter(item))
    .sort((a, b) => {
      const tierDiff = homeLocaleSortTier(a.item) - homeLocaleSortTier(b.item);
      if (tierDiff !== 0) return tierDiff;
      return a.index - b.index;
    })
    .map(({ item }) => item);

  return limit != null ? filtered.slice(0, limit) : filtered;
}

export function withUsUkEnglishDiscoverFilters(
  filters: Record<string, string>
): Record<string, string> {
  return {
    ...filters,
    with_origin_country: [...PREFERRED_ORIGINS].join("|"),
    with_original_language: PREFERRED_LANGUAGE,
  };
}
