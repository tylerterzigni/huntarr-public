import {
  searchMulti,
  searchMultiMultiPage,
  searchPerson,
} from "@/lib/integrations/tmdb/client";
import { getMediaTitle, mediaItemKey } from "@/lib/integrations/tmdb/helpers";
import { enrichWithStatus } from "@/lib/recommendations/filters";
import {
  fetchPersonFilmography,
  pickPersonForSearch,
} from "@/lib/recommendations/personal-people";
import { searchWatchHistory } from "@/lib/recommendations/engine";
import { sortSearchResults, titleMatchScore } from "@/lib/search/rank-search-results";
import {
  SEARCH_PREVIEW_INITIAL,
} from "@/lib/search/preview-constants";
import { scorePersonNameMatch } from "@/lib/search/person-name-match";
import { compactMatchText } from "@/lib/search/fuzzy-text-match";
import {
  generateSpellingQueryVariants,
  generateWhitespaceQueryVariants,
} from "@/lib/search/typo-variants";
import type {
  RecommendationItem,
  TmdbMediaItem,
  TmdbPersonSearchResult,
} from "@/types";

export interface SearchPeopleResult {
  id: number;
  name: string;
  profile_path?: string | null;
  known_for_department?: string;
  familiar?: boolean;
  familiarLabel?: string;
}

export type SearchPreviewItem =
  | {
      kind: "person";
      id: number;
      name: string;
      imagePath?: string | null;
      subtitle?: string;
    }
  | {
      kind: "movie" | "tv";
      id: number;
      name: string;
      imagePath?: string | null;
    };

function filterMediaResults(items: TmdbMediaItem[]): TmdbMediaItem[] {
  return items.filter((item) => item.media_type === "movie" || item.media_type === "tv");
}

/** TMDB person search with light typo expansion when the typed query misses. */
async function searchPersonWithTypos(
  query: string
): Promise<{ results: TmdbPersonSearchResult[]; total_pages: number }> {
  const seen = new Set<number>();
  const results: TmdbPersonSearchResult[] = [];

  for (const variant of [
    query.trim(),
    ...generateSpellingQueryVariants(query, 12),
  ].filter(Boolean)) {
    const search = await searchPerson(variant, 1).catch(() => ({
      results: [] as TmdbPersonSearchResult[],
      total_pages: 0,
    }));
    for (const person of search.results) {
      if (seen.has(person.id)) continue;
      seen.add(person.id);
      results.push(person);
    }
    if (results.some((person) => scorePersonNameMatch(query, person.name) >= 1_500)) {
      break;
    }
  }

  return { results, total_pages: results.length > 0 ? 1 : 0 };
}

/** Multi search with typo variants when the exact query returns nothing useful.
 *  Whitespace variants are always merged on page 1 so compacted queries like
 *  "lovelife" still find "Love Life" even when TMDB returns other weak hits.
 */
async function searchMultiWithTypos(
  query: string,
  page: number
): Promise<{ results: TmdbMediaItem[]; total_pages: number; page: number }> {
  const first = await searchMulti(query, page);
  const filtered = filterMediaResults(first.results);

  const mergeWhitespaceVariants = async (base: TmdbMediaItem[]) => {
    const spaceVariants = generateWhitespaceQueryVariants(query, 4);
    if (spaceVariants.length === 0) return base;

    const seen = new Set(base.map((item) => item.id));
    const pooled = [...base];
    for (const variant of spaceVariants) {
      const data = await searchMulti(variant, 1).catch(() => ({
        results: [] as TmdbMediaItem[],
        total_pages: 0,
      }));
      for (const item of filterMediaResults(data.results)) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        pooled.push(item);
      }
    }
    return pooled;
  };

  if (filtered.length > 0 || page > 1) {
    if (page > 1) {
      return { results: filtered, total_pages: first.total_pages, page };
    }
    let pooled = await mergeWhitespaceVariants(filtered);

    // If nothing looks like a real title hit, also try spelling fixes
    // ("ricky gervas" may return weak junk while "ricky gervais" is correct).
    const bestTitle = Math.max(
      0,
      ...pooled.map((item) => titleMatchScore(query, getMediaTitle(item)))
    );
    if (bestTitle < 2_000) {
      const seen = new Set(pooled.map((item) => item.id));
      for (const variant of generateSpellingQueryVariants(query, 8)) {
        const data = await searchMulti(variant, 1).catch(() => ({
          results: [] as TmdbMediaItem[],
          total_pages: 0,
        }));
        for (const item of filterMediaResults(data.results)) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          pooled.push(item);
        }
        if (
          pooled.some((item) => titleMatchScore(query, getMediaTitle(item)) >= 2_000)
        ) {
          break;
        }
      }
    }

    return { results: pooled, total_pages: first.total_pages, page };
  }

  const seen = new Set<number>();
  const pooled: TmdbMediaItem[] = [];
  // Prefer spelling fixes over whitespace mashups when the typed query missed.
  for (const variant of generateSpellingQueryVariants(query, 12)) {
    const data = await searchMulti(variant, 1).catch(() => ({
      results: [] as TmdbMediaItem[],
      total_pages: 0,
    }));
    for (const item of filterMediaResults(data.results)) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      pooled.push(item);
    }
    if (pooled.length >= 8) break;
  }

  return { results: pooled, total_pages: pooled.length > 0 ? 1 : 0, page: 1 };
}

function knownForToMedia(person: TmdbPersonSearchResult): TmdbMediaItem[] {
  return (person.known_for ?? [])
    .filter((item) => item.media_type === "movie" || item.media_type === "tv")
    .map((item) => ({
      ...item,
      media_type: item.media_type ?? (item.title ? "movie" : "tv"),
    }));
}

function mergeMediaResults(...lists: TmdbMediaItem[][]): TmdbMediaItem[] {
  const seen = new Set<string>();
  const merged: TmdbMediaItem[] = [];

  for (const list of lists) {
    for (const item of list) {
      const key = mediaItemKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }

  return merged;
}

function toPeopleResult(
  person: TmdbPersonSearchResult,
  meta?: { familiar?: boolean; familiarLabel?: string }
): SearchPeopleResult {
  return {
    id: person.id,
    name: person.name,
    profile_path: person.profile_path,
    known_for_department: person.known_for_department,
    familiar: meta?.familiar,
    familiarLabel: meta?.familiarLabel,
  };
}

async function watchHistoryMediaMatches(
  userId: string,
  query: string
): Promise<TmdbMediaItem[]> {
  const seeds = await searchWatchHistory(userId, query, 8);
  return seeds.map((seed) => ({
    id: seed.tmdbId,
    media_type: seed.mediaType,
    title: seed.mediaType === "movie" ? seed.title : undefined,
    name: seed.mediaType === "tv" ? seed.title : undefined,
  }));
}

async function enrichSearchResults(
  userId: string,
  items: TmdbMediaItem[],
  query: string
): Promise<RecommendationItem[]> {
  const enriched = await enrichWithStatus(items, userId);
  return sortSearchResults(query, enriched);
}

async function fetchMultiResults(
  query: string,
  options: { page?: number; pages?: number }
): Promise<{ results: TmdbMediaItem[]; total_pages: number; page: number }> {
  if (options.pages) {
    const pageCount = Math.min(Math.max(options.pages, 1), 10);
    const [firstPage, rawResults] = await Promise.all([
      searchMulti(query, 1),
      searchMultiMultiPage(query, pageCount),
    ]);

    const filtered = filterMediaResults(rawResults);
    if (filtered.length > 0) {
      return {
        results: filtered,
        total_pages: firstPage.total_pages,
        page: 1,
      };
    }

    return searchMultiWithTypos(query, 1);
  }

  const page = options.page ?? 1;
  return searchMultiWithTypos(query, page);
}

export async function runSearch(
  userId: string,
  query: string,
  options: { page?: number; pages?: number } = {}
): Promise<{
  results: RecommendationItem[];
  people: SearchPeopleResult[];
  count: number;
  total_pages: number;
  page: number;
}> {
  const [personSearch, multiSearch, historyMatches] = await Promise.all([
    searchPersonWithTypos(query),
    fetchMultiResults(query, options),
    watchHistoryMediaMatches(userId, query).catch(() => []),
  ]);

  const personPick = await pickPersonForSearch(userId, query, personSearch.results);

  const page = options.page ?? 1;
  if (page > 1) {
    const enriched = await enrichSearchResults(userId, multiSearch.results, query);
    return {
      results: enriched,
      people: [],
      count: enriched.length,
      total_pages: multiSearch.total_pages,
      page: multiSearch.page,
    };
  }

  const primaryMedia = mergeMediaResults(historyMatches, multiSearch.results);
  const strongTitleMatch = primaryMedia.some(
    (item) => titleMatchScore(query, getMediaTitle(item)) >= 9_000
  );
  const mediaClaimsPersonName =
    !!personPick &&
    primaryMedia.some(
      (item) =>
        compactMatchText(getMediaTitle(item)) === compactMatchText(personPick.person.name) &&
        titleMatchScore(query, getMediaTitle(item)) >= 9_000
    );
  const includePerson =
    !!personPick &&
    (personPick.familiar ||
      (!mediaClaimsPersonName &&
        (scorePersonNameMatch(query, personPick.person.name) >= 5_000 ||
          !strongTitleMatch)));

  const knownForMedia =
    includePerson && personPick ? knownForToMedia(personPick.person) : [];
  const filmography =
    includePerson && personPick
      ? await fetchPersonFilmography(personPick.person.id).catch(() => [])
      : [];

  const combinedMedia = mergeMediaResults(primaryMedia, knownForMedia, filmography);
  const enriched = await enrichSearchResults(userId, combinedMedia, query);
  const people =
    includePerson && personPick ? [toPeopleResult(personPick.person, personPick)] : [];

  return {
    results: enriched,
    people,
    count: enriched.length,
    total_pages: multiSearch.total_pages,
    page: multiSearch.page,
  };
}

export async function runSearchPreview(
  userId: string,
  query: string,
  options: { offset?: number; limit?: number } | number = {}
): Promise<{ items: SearchPreviewItem[]; hasMore: boolean }> {
  // Back-compat: older callers passed a numeric limit.
  const opts = typeof options === "number" ? { limit: options } : options;
  const offset = Math.max(0, opts.offset ?? 0);
  const limit = Math.max(1, opts.limit ?? SEARCH_PREVIEW_INITIAL);
  const need = offset + limit + 1; // +1 to detect hasMore

  const [personSearch, firstMulti, historyMatches] = await Promise.all([
    searchPersonWithTypos(query),
    searchMultiWithTypos(query, 1),
    watchHistoryMediaMatches(userId, query).catch(() => [] as TmdbMediaItem[]),
  ]);
  const personPick = await pickPersonForSearch(userId, query, personSearch.results);

  const mediaPool = mergeMediaResults(historyMatches, firstMulti.results);
  const rankedMedia = sortSearchResults(query, filterMediaResults(mediaPool));

  // Prefer a title hit over an obscure person with the same compound name
  // ("lovelife" → show "Love Life", not a random actor also named Love Life).
  const strongTitleMatch = rankedMedia.some(
    (item) => titleMatchScore(query, getMediaTitle(item)) >= 9_000
  );
  const personNameCompact = personPick
    ? compactMatchText(personPick.person.name)
    : "";
  const mediaClaimsPersonName =
    !!personPick &&
    rankedMedia.some(
      (item) =>
        compactMatchText(getMediaTitle(item)) === personNameCompact &&
        titleMatchScore(query, getMediaTitle(item)) >= 9_000
    );
  const includePerson =
    !!personPick &&
    (personPick.familiar ||
      (!mediaClaimsPersonName &&
        (scorePersonNameMatch(query, personPick.person.name) >= 5_000 ||
          !strongTitleMatch)));
  const pinPersonFirst =
    includePerson &&
    !!personPick &&
    (personPick.familiar || scorePersonNameMatch(query, personPick.person.name) >= 5_000);

  const items: SearchPreviewItem[] = [];
  const seen = new Set<string>();

  const pushPerson = () => {
    if (!personPick || !includePerson) return;
    const key = `person:${personPick.person.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({
      kind: "person",
      id: personPick.person.id,
      name: personPick.person.name,
      imagePath: personPick.person.profile_path,
      subtitle: personPick.familiar
        ? personPick.familiarLabel
        : personPick.person.known_for_department,
    });
  };

  if (pinPersonFirst) pushPerson();

  const appendMedia = (results: TmdbMediaItem[]) => {
    const ranked = sortSearchResults(query, filterMediaResults(results));
    for (const item of ranked) {
      const key = `${item.media_type}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        kind: item.media_type!,
        id: item.id,
        name: item.title ?? item.name ?? "Unknown",
        imagePath: item.poster_path,
      });
      if (items.length >= need) return;
    }
  };

  appendMedia(mediaPool);

  let page = 2;
  let totalPages = Math.max(1, firstMulti.total_pages);
  while (items.length < need && page <= totalPages) {
    const multi = await searchMulti(query, page);
    totalPages = Math.max(totalPages, multi.total_pages);
    appendMedia(multi.results);
    page += 1;
  }

  if (!pinPersonFirst) pushPerson();

  return {
    items: items.slice(offset, offset + limit),
    hasMore: items.length > offset + limit,
  };
}
