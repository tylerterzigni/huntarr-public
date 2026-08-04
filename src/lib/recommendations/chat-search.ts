import {
  discoverMoviesMultiPage,
  discoverTvMultiPage,
  searchKeyword,
} from "@/lib/integrations/tmdb/client";
import { buildDiscoverFiltersForChat } from "@/lib/discover/build-filters";
import { isKeywordBackedGenreId } from "@/lib/discover/genres";
import { getMediaTitle, inferMediaType, mediaItemKey } from "@/lib/integrations/tmdb/helpers";
import { rerankRecommendations } from "@/lib/ai/provider";
import { fallbackCriteriaFromMessage } from "@/lib/ai/parse-chat-response";
import {
  browseMoreLikeMedia,
  buildMoreLikeReason,
  type MoreLikeSource,
} from "@/lib/recommendations/more-like-search";
import {
  buildPersonCreditLookup,
  buildVerifiedPersonReason,
  filterPersonCreditsByCriteria,
  loadPersonCreditEntries,
  sortPersonSearchResults,
  type PersonCreditEntry,
} from "@/lib/recommendations/person-credits";
import {
  filterItemsByDateCriteria,
  hasDateCriteria,
  itemMatchesDateCriteria,
} from "@/lib/search/date-criteria";
import { sortSearchResults } from "@/lib/search/rank-search-results";
import {
  CHAT_DISCOVER_PAGES,
  CHAT_RERANK_POOL,
  FOR_YOU_QUALITY_MIN_VOTE_COUNT,
} from "./constants";
import { generateTasteSummary, loadTasteProfile } from "./engine";
import { getPersonalPeopleSummary } from "./personal-people";
import { fetchCandidateRtRatings } from "./fetch-candidate-ratings";
import { enrichWithStatus, scoreItem } from "./filters";
import type { MediaType, RecommendationItem, SearchCriteria, TmdbMediaItem } from "@/types";

function getItemDate(item: TmdbMediaItem): string | null {
  return item.release_date ?? item.first_air_date ?? null;
}

function filterByDate(
  items: TmdbMediaItem[],
  criteria: SearchCriteria,
  options: { keepUndated?: boolean } = {}
): TmdbMediaItem[] {
  return filterItemsByDateCriteria(items, criteria, options);
}

function filterByRating(items: TmdbMediaItem[], criteria: SearchCriteria): TmdbMediaItem[] {
  if (!criteria.minRating) return items;
  return items.filter((item) => (item.vote_average ?? 0) >= criteria.minRating!);
}

function filterByGenre(items: TmdbMediaItem[], criteria: SearchCriteria): TmdbMediaItem[] {
  const genreIds = criteria.genres ?? [];
  if (genreIds.length === 0) return items;

  const realGenreIds = genreIds.filter((id) => id > 0 && !isKeywordBackedGenreId(id));
  // Keyword-backed genres (e.g. Stand-Up Comedy) are enforced by TMDB with_keywords at discover time.
  if (realGenreIds.length === 0) return items;

  return items.filter((item) => {
    if (!item.genre_ids?.length) return false;
    return realGenreIds.some((id) => item.genre_ids!.includes(id));
  });
}

function tagMediaType(items: TmdbMediaItem[], mediaType: MediaType): TmdbMediaItem[] {
  return items.map((item) => ({ ...item, media_type: mediaType }));
}

function mergeUniqueItems(
  target: TmdbMediaItem[],
  incoming: TmdbMediaItem[],
  seen: Set<string>
) {
  for (const item of incoming) {
    const key = mediaItemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    target.push(item);
  }
}

function dedupeMediaItems(items: TmdbMediaItem[]): TmdbMediaItem[] {
  const seen = new Set<string>();
  const deduped: TmdbMediaItem[] = [];
  for (const item of items) {
    const key = mediaItemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function hasGenreScope(criteria: SearchCriteria): boolean {
  return Boolean((criteria.genres?.length ?? 0) > 0 || criteria.withKeywords);
}

function buildDiscoverSort(
  criteria: SearchCriteria,
  mediaType: MediaType
): Record<string, string> {
  if (criteria.minRating && criteria.minRating >= 7) {
    return {
      sort_by: "vote_average.desc",
      "vote_count.gte": String(FOR_YOU_QUALITY_MIN_VOTE_COUNT),
    };
  }
  if (criteria.dateMin || criteria.dateMax || criteria.yearMin || criteria.yearMax) {
    return {
      sort_by: mediaType === "tv" ? "first_air_date.desc" : "primary_release_date.desc",
    };
  }
  return {};
}

async function discoverWithGenres(
  criteria: SearchCriteria,
  mediaType: MediaType,
  genreIds: number[]
): Promise<TmdbMediaItem[]> {
  const filters = {
    ...buildDiscoverFiltersForChat({ ...criteria, genres: genreIds }, mediaType),
    ...buildDiscoverSort(criteria, mediaType),
  };
  const data =
    mediaType === "movie"
      ? await discoverMoviesMultiPage(filters, CHAT_DISCOVER_PAGES)
      : await discoverTvMultiPage(filters, CHAT_DISCOVER_PAGES);
  return tagMediaType(data, mediaType);
}

async function discoverForMediaType(
  criteria: SearchCriteria,
  mediaType: MediaType
): Promise<TmdbMediaItem[]> {
  const genres = criteria.genres ?? [];
  const seen = new Set<string>();
  const results: TmdbMediaItem[] = [];

  if (genres.length === 0) {
    const filters = {
      ...buildDiscoverFiltersForChat(criteria, mediaType),
      ...buildDiscoverSort(criteria, mediaType),
    };
    const data =
      mediaType === "movie"
        ? await discoverMoviesMultiPage(filters, CHAT_DISCOVER_PAGES)
        : await discoverTvMultiPage(filters, CHAT_DISCOVER_PAGES);
    mergeUniqueItems(results, tagMediaType(data, mediaType), seen);
    return results;
  }

  mergeUniqueItems(results, await discoverWithGenres(criteria, mediaType, genres), seen);

  if (results.length < 12 && genres.length > 1) {
    for (const genreId of genres) {
      mergeUniqueItems(
        results,
        await discoverWithGenres(criteria, mediaType, [genreId]),
        seen
      );
    }
  }

  return results;
}

const PERSON_DISCOVER_LOCALE = {
  with_original_language: "en",
  with_origin_country: "US|GB",
};

async function fetchPersonDiscover(
  criteria: SearchCriteria,
  mediaType: MediaType
): Promise<TmdbMediaItem[]> {
  const person = criteria.withPerson;
  if (!person) return [];

  const seen = new Set<string>();
  const results: TmdbMediaItem[] = [];
  const sort = buildDiscoverSort(criteria, mediaType);

  const runDiscover = async (crewOrCast: "withCrew" | "withCast") => {
    const personCriteria: SearchCriteria = {
      ...criteria,
      language: criteria.language ?? "en",
      withCrew: crewOrCast === "withCrew" ? [person.tmdbId] : undefined,
      withCast: crewOrCast === "withCast" ? [person.tmdbId] : undefined,
    };
    const filters = {
      ...buildDiscoverFiltersForChat(personCriteria, mediaType),
      ...sort,
      ...PERSON_DISCOVER_LOCALE,
    };
    const data =
      mediaType === "movie"
        ? await discoverMoviesMultiPage(filters, CHAT_DISCOVER_PAGES)
        : await discoverTvMultiPage(filters, CHAT_DISCOVER_PAGES);
    mergeUniqueItems(results, tagMediaType(data, mediaType), seen);
  };

  if (person.creditType === "crew" || person.creditType === "both") {
    await runDiscover("withCrew");
  }
  if (person.creditType === "cast" || person.creditType === "both") {
    await runDiscover("withCast");
  }

  return results;
}

async function browsePersonWithCriteria(criteria: SearchCriteria): Promise<{
  items: TmdbMediaItem[];
  creditLookup: ReturnType<typeof buildPersonCreditLookup>;
}> {
  const person = criteria.withPerson;
  if (!person) return { items: [], creditLookup: new Map() };

  const allCreditEntries = await loadPersonCreditEntries(person.tmdbId, person.creditType);
  const personCreditLookup = buildPersonCreditLookup(allCreditEntries);
  const creditLookup = new Map<string, PersonCreditEntry>();
  const seen = new Set<string>();
  let items: TmdbMediaItem[] = [];
  const genreScoped = hasGenreScope(criteria);

  for (const mediaType of mediaTypesForCriteria(criteria)) {
    for (const item of await fetchPersonDiscover(criteria, mediaType)) {
      const tagged = { ...item, media_type: mediaType };
      const key = mediaItemKey(tagged);
      const known = personCreditLookup.get(key);
      if (!known) continue;

      const [filtered] = filterPersonCreditsByCriteria(
        [{ ...known, item: { ...known.item, ...tagged } }],
        criteria
      );
      if (!filtered) continue;

      creditLookup.set(key, filtered);
      mergeUniqueItems(items, [filtered.item], seen);
    }
  }

  if (!genreScoped) {
    for (const entry of filterPersonCreditsByCriteria(allCreditEntries, criteria)) {
      const key = mediaItemKey(entry.item);
      creditLookup.set(key, entry);
      mergeUniqueItems(items, [entry.item], seen);
    }
  } else if (items.length === 0) {
    for (const entry of filterPersonCreditsByCriteria(allCreditEntries, criteria)) {
      const key = mediaItemKey(entry.item);
      creditLookup.set(key, entry);
      mergeUniqueItems(items, [entry.item], seen);
    }
  }

  items = sortPersonSearchResults(items, creditLookup);

  return { items, creditLookup };
}

function isDeterministicChatSearch(criteria: SearchCriteria): boolean {
  return Boolean(
    criteria.moreLike ||
    criteria.withPerson ||
    criteria.withKeywords ||
    (criteria.keywords?.length ?? 0) > 0 ||
    (criteria.genres?.length ?? 0) > 0 ||
    hasDateCriteria(criteria) ||
    criteria.mediaType
  );
}

async function browseMoreLikeWithCriteria(criteria: SearchCriteria): Promise<{
  items: TmdbMediaItem[];
  moreLikeSources: Map<number, MoreLikeSource>;
}> {
  const result = await browseMoreLikeMedia(criteria);
  return { items: result.items, moreLikeSources: result.itemSources };
}

async function fetchKeywordItems(
  criteria: SearchCriteria,
  mediaType: MediaType,
  terms: string[]
): Promise<TmdbMediaItem[]> {
  const seen = new Set<string>();
  const results: TmdbMediaItem[] = [];

  for (const term of terms.slice(0, 3)) {
    try {
      const search = await searchKeyword(term);
      const keywordId = search.results[0]?.id;
      if (!keywordId) continue;

      const keywordCriteria: SearchCriteria = {
        ...criteria,
        withKeywords: String(keywordId),
      };
      const filters = {
        ...buildDiscoverFiltersForChat(keywordCriteria, mediaType),
        ...buildDiscoverSort(criteria, mediaType),
      };
      const data =
        mediaType === "movie"
          ? await discoverMoviesMultiPage(filters, CHAT_DISCOVER_PAGES)
          : await discoverTvMultiPage(filters, CHAT_DISCOVER_PAGES);
      mergeUniqueItems(results, tagMediaType(data, mediaType), seen);
    } catch {
      continue;
    }
  }

  return results;
}

function buildFallbackReason(item: TmdbMediaItem, criteria: SearchCriteria): string {
  const title = getMediaTitle(item);
  const date = getItemDate(item);
  const year = date ? date.slice(0, 4) : null;
  const parts: string[] = [];

  if (criteria.mediaType === "tv") parts.push("TV series");
  else if (criteria.mediaType === "movie") parts.push("Movie");
  if (criteria.mood) parts.push(criteria.mood);
  if (criteria.moreLike?.title) parts.push(`similar vibe to ${criteria.moreLike.title}`);
  if (year) {
    parts.push(
      criteria.mediaType === "tv" || criteria.mediaType === "all"
        ? `first aired ${year}`
        : `released ${year}`
    );
  }

  if (parts.length) {
    return `${title} — ${parts.join(", ")}`;
  }
  return item.overview?.slice(0, 120) ?? `Matches your search for ${title}`;
}

function buildThemedKeywordReason(item: TmdbMediaItem, criteria: SearchCriteria): string {
  const title = getMediaTitle(item);
  const mediaType = inferMediaType(item);
  const themeLabels = (criteria.keywords ?? []).slice(0, 3).join(", ");
  const parts: string[] = [mediaType === "tv" ? "TV series" : "Movie"];
  if (themeLabels) parts.push(`matches ${themeLabels}`);
  const date = getItemDate(item);
  const year = date ? date.slice(0, 4) : null;
  if (year) {
    parts.push(mediaType === "tv" ? `first aired ${year}` : `released ${year}`);
  }
  return `${title} — ${parts.join(", ")}`;
}

function isKeywordThemedSearch(criteria: SearchCriteria): boolean {
  return Boolean(criteria.withKeywords) && !criteria.withPerson;
}

function mediaTypesForCriteria(criteria: SearchCriteria): MediaType[] {
  if (criteria.mediaType === "all") return ["movie", "tv"];
  if (criteria.mediaType === "movie" || criteria.mediaType === "tv") {
    return [criteria.mediaType];
  }
  return ["movie", "tv"];
}

function keywordTermsFromMessage(message: string, criteria: SearchCriteria): string[] {
  const terms = new Set<string>();

  if (Array.isArray(criteria.keywords)) {
    for (const keyword of criteria.keywords) {
      if (typeof keyword === "string" && keyword.trim()) terms.add(keyword.trim());
    }
  }

  const fallback = fallbackCriteriaFromMessage(message);
  if (Array.isArray(fallback.keywords)) {
    for (const keyword of fallback.keywords) {
      if (typeof keyword === "string" && keyword.trim()) terms.add(keyword.trim());
    }
  }

  const skipComedyKeyword =
    criteria.mediaType === "tv" || terms.has("sitcom");

  return [...terms].filter(
    (term) => !(skipComedyKeyword && term.toLowerCase() === "comedy")
  );
}

async function browseWithCriteria(
  criteria: SearchCriteria,
  userMessage?: string
): Promise<{
  items: TmdbMediaItem[];
  creditLookup: ReturnType<typeof buildPersonCreditLookup>;
  moreLikeSources: Map<number, MoreLikeSource>;
}> {
  const seen = new Set<string>();
  let items: TmdbMediaItem[] = [];

  if (criteria.withPersonUnresolved) {
    return { items: [], creditLookup: new Map(), moreLikeSources: new Map() };
  }

  // “Like X” (optionally “by Y”) uses more-like lookup; person-only searches stay below.
  if (criteria.moreLike && !isKeywordThemedSearch(criteria)) {
    const moreLikeBrowse = await browseMoreLikeWithCriteria(criteria);
    const dated = filterByDate(moreLikeBrowse.items, criteria);
    const keep = new Set(dated.map((item) => item.id));
    for (const id of [...moreLikeBrowse.moreLikeSources.keys()]) {
      if (!keep.has(id)) moreLikeBrowse.moreLikeSources.delete(id);
    }
    return {
      items: dated,
      creditLookup: new Map(),
      moreLikeSources: moreLikeBrowse.moreLikeSources,
    };
  }

  if (criteria.withPerson) {
    const personBrowse = await browsePersonWithCriteria(criteria);
    return { ...personBrowse, moreLikeSources: new Map() };
  }

  if (criteria.moreLikeUnresolved) {
    return { items: [], creditLookup: new Map(), moreLikeSources: new Map() };
  }

  const keywordThemed = isKeywordThemedSearch(criteria);

  if (keywordThemed) {
    for (const mediaType of mediaTypesForCriteria(criteria)) {
      mergeUniqueItems(items, await discoverForMediaType(criteria, mediaType), seen);
    }
    if (userMessage) {
      const keywordTerms = keywordTermsFromMessage(userMessage, criteria);
      if (keywordTerms.length > 0) {
        for (const mediaType of mediaTypesForCriteria(criteria)) {
          mergeUniqueItems(
            items,
            await fetchKeywordItems(criteria, mediaType, keywordTerms),
            seen
          );
        }
      }
    }
  } else {
    for (const mediaType of mediaTypesForCriteria(criteria)) {
      mergeUniqueItems(items, await discoverForMediaType(criteria, mediaType), seen);
    }

    if (userMessage) {
      const keywordTerms = keywordTermsFromMessage(userMessage, criteria);
      if (keywordTerms.length > 0) {
        for (const mediaType of mediaTypesForCriteria(criteria)) {
          mergeUniqueItems(
            items,
            await fetchKeywordItems(criteria, mediaType, keywordTerms),
            seen
          );
        }
      }
    }
  }

  items = filterByDate(items, criteria);
  items = filterByRating(items, criteria);
  items = filterByGenre(items, criteria);
  return { items, creditLookup: new Map(), moreLikeSources: new Map() };
}

function buildRelaxSteps(criteria: SearchCriteria): SearchCriteria[] {
  const relaxedSearch = isDeterministicChatSearch(criteria);
  const base: SearchCriteria = {
    ...criteria,
    excludeHidden: relaxedSearch ? false : (criteria.excludeHidden ?? true),
    excludeWatched: false,
    excludeInLibrary: relaxedSearch ? false : (criteria.excludeInLibrary ?? true),
  };

  const hasDateRange = hasDateCriteria(base);
  const steps: SearchCriteria[] = [base];

  if (base.withKeywords && !base.withPerson) {
    return steps;
  }

  if (hasDateRange && (base.genres?.length ?? 0) > 1) {
    steps.push({
      ...base,
      genres: base.genres?.slice(0, 1),
    });
  } else if (!hasDateRange && (base.genres?.length ?? 0) > 1) {
    steps.push({
      ...base,
      genres: base.genres?.slice(0, 1),
    });
    if (base.withKeywords) {
      steps.push({
        ...base,
        withKeywords: undefined,
        genres: base.genres?.slice(0, 1),
      });
    }
  }

  return steps;
}

async function rerankChatCandidates(
  pool: TmdbMediaItem[],
  taste: Awaited<ReturnType<typeof loadTasteProfile>>,
  criteria: SearchCriteria,
  userId: string,
  creditLookup: ReturnType<typeof buildPersonCreditLookup>,
  moreLikeSources: Map<number, MoreLikeSource> = new Map()
): Promise<Array<{ item: TmdbMediaItem; score: number; reason: string }>> {
  if (criteria.withPerson) {
    const sorted = sortPersonSearchResults(pool, creditLookup);
    return sorted.map((item, index) => ({
      item,
      score: 100 - index,
      reason: buildVerifiedPersonReason(item, criteria, creditLookup),
    }));
  }

  if (criteria.moreLike?.title) {
    const anchorTitle = criteria.moreLike.title;
    return pool.map((item, index) => ({
      item,
      score: 100 - index,
      reason: buildMoreLikeReason(item, anchorTitle, moreLikeSources.get(item.id)),
    }));
  }

  if (isKeywordThemedSearch(criteria)) {
    const sorted = sortSearchResults("", pool);
    return sorted.map((item, index) => ({
      item,
      score: 100 - index,
      reason: buildThemedKeywordReason(item, criteria),
    }));
  }

  const personalSummary = await getPersonalPeopleSummary(userId);
  const tasteSummary = generateTasteSummary({
    ...taste,
    familiarCreators: personalSummary.creators,
    familiarActors: personalSummary.actors,
  });
  const rtMap = await fetchCandidateRtRatings(pool);

  try {
    const rankings = await rerankRecommendations(
      userId,
      pool.map((item) => ({
        id: item.id,
        title: getMediaTitle(item),
        overview: item.overview?.slice(0, 160),
        tmdbRating: item.vote_average,
        rtCriticsScore: rtMap.get(item.id)?.rtCritics,
        rtAudienceScore: rtMap.get(item.id)?.rtAudience,
      })),
      tasteSummary,
      criteria as Record<string, unknown>
    );

    const itemMap = new Map(pool.map((item) => [item.id, item]));
    return rankings
      .filter((rank) => itemMap.has(rank.id))
      .sort((a, b) => b.score - a.score)
      .map((rank) => ({
        item: itemMap.get(rank.id)!,
        score: rank.score,
        reason: rank.reason,
      }));
  } catch {
    return pool.map((item, index) => ({
      item,
      score: 100 - index,
      reason: buildFallbackReason(item, criteria),
    }));
  }
}

export async function getChatRecommendations(
  userId: string,
  criteria: SearchCriteria,
  limit = 8,
  userMessage?: string,
  options: { excludeKeys?: string[] } = {}
): Promise<RecommendationItem[]> {
  const isPersonSearch = Boolean(criteria.withPerson);
  const isKeywordSearch = isKeywordThemedSearch(criteria);
  const isMoreLikeSearch = Boolean(criteria.moreLike);
  const isRelaxedSearch = isDeterministicChatSearch(criteria);
  const searchCriteria: SearchCriteria = {
    ...criteria,
    excludeHidden: isRelaxedSearch ? false : (criteria.excludeHidden ?? true),
    excludeWatched: false,
    excludeInLibrary: isRelaxedSearch ? false : (criteria.excludeInLibrary ?? true),
  };

  const relaxSteps = buildRelaxSteps(searchCriteria);
  const hasDateRange = hasDateCriteria(searchCriteria);

  let rawItems: TmdbMediaItem[] = [];
  let creditLookup = new Map<string, PersonCreditEntry>();
  let moreLikeSources = new Map<number, MoreLikeSource>();
  for (const attempt of relaxSteps) {
    try {
      const browse = await browseWithCriteria(attempt, userMessage);
      rawItems = browse.items;
      creditLookup = browse.creditLookup;
      moreLikeSources = browse.moreLikeSources;
      const minResults = hasDateRange ? 1 : Math.min(limit, 3);
      if (rawItems.length >= minResults) break;
    } catch {
      continue;
    }
  }

  if (rawItems.length === 0) return [];

  rawItems = dedupeMediaItems(rawItems);

  const enriched = await enrichWithStatus(rawItems, userId);
  const filtered = dedupeMediaItems(
    enriched.filter((item) => {
      if (searchCriteria.excludeHidden !== false && item.hidden) return false;
      if (searchCriteria.excludeWatched && item.fullyWatched) return false;
      if (searchCriteria.excludeInLibrary !== false && item.inLibrary) return false;
      if (searchCriteria.mediaType && searchCriteria.mediaType !== "all") {
        const itemType = inferMediaType(item);
        if (itemType !== searchCriteria.mediaType) return false;
      }
      if (!itemMatchesDateCriteria(item, searchCriteria)) return false;
      return true;
    })
  );

  if (filtered.length === 0) return [];

  const taste = await loadTasteProfile(userId);

  const preRanked = isMoreLikeSearch
    ? filtered.map((item) => ({ item, heuristic: 0 }))
    : filtered
        .map((item) => ({ item, heuristic: scoreItem(item, taste, searchCriteria) }))
        .sort((a, b) => b.heuristic - a.heuristic);

  const isPaginated = (options.excludeKeys?.length ?? 0) > 0;
  const poolLimit =
    isPersonSearch || isMoreLikeSearch || isPaginated
      ? filtered.length
      : CHAT_RERANK_POOL;
  const pool = dedupeMediaItems(preRanked.slice(0, poolLimit).map(({ item }) => item));
  const ranked = await rerankChatCandidates(
    pool,
    taste,
    searchCriteria,
    userId,
    creditLookup,
    moreLikeSources
  );

  const excludeKeys = new Set(options.excludeKeys ?? []);
  const seen = new Set<string>();
  const results: RecommendationItem[] = [];
  for (const { item, score, reason } of ranked) {
    const key = mediaItemKey(item);
    if (excludeKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    results.push({ ...item, score, reason });
    if (results.length >= limit) break;
  }

  return results;
}
