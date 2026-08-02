import {
  discoverMoviesMultiPage,
  discoverTvMultiPage,
  getCollection,
  getMediaItemBrief,
  getMovieDetails,
  getRecommendations,
  getSimilar,
  getTvDetails,
  searchMovie,
  searchTv,
} from "@/lib/integrations/tmdb/client";
import { buildDiscoverFiltersForChat } from "@/lib/discover/build-filters";
import { getMediaTitle, inferMediaType, mediaItemKey } from "@/lib/integrations/tmdb/helpers";
import { resolveMediaTitle } from "@/lib/search/resolve-media-title";
import {
  localePriorityScore,
  passesHomeLocaleFilter,
} from "@/lib/recommendations/locale-priority";
import type { MediaType, SearchCriteria, TmdbMediaItem } from "@/types";

const MORE_LIKE_LOCALE = {
  with_original_language: "en",
  with_origin_country: "US|GB",
};

export type MoreLikeSource =
  | "franchise-anchor"
  | "franchise"
  | "creator"
  | "search"
  | "recommendation"
  | "similar"
  | "genre";

interface RankedMoreLikeItem {
  item: TmdbMediaItem;
  tier: number;
  source: MoreLikeSource;
}

export interface MoreLikeBrowseResult {
  items: TmdbMediaItem[];
  itemSources: Map<number, MoreLikeSource>;
}

const SOURCE_TIER: Record<MoreLikeSource, number> = {
  "franchise-anchor": -2,
  franchise: 0,
  creator: 1,
  search: 2,
  recommendation: 3,
  similar: 4,
  genre: 5,
};

const SOURCE_PRIORITY: Record<MoreLikeSource, number> = {
  "franchise-anchor": 0,
  franchise: 1,
  creator: 2,
  search: 3,
  recommendation: 4,
  similar: 5,
  genre: 6,
};

function tagMediaType(items: TmdbMediaItem[], mediaType: MediaType): TmdbMediaItem[] {
  return items.map((item) => ({ ...item, media_type: mediaType }));
}

function recordSource(
  sourceMap: Map<number, MoreLikeSource>,
  itemId: number,
  source: MoreLikeSource
) {
  const existing = sourceMap.get(itemId);
  if (!existing || SOURCE_PRIORITY[source] < SOURCE_PRIORITY[existing]) {
    sourceMap.set(itemId, source);
  }
}

function mergeRankedItems(
  target: RankedMoreLikeItem[],
  incoming: TmdbMediaItem[],
  seen: Set<string>,
  source: MoreLikeSource,
  sourceMap: Map<number, MoreLikeSource>
) {
  const tier = SOURCE_TIER[source];
  for (const item of incoming) {
    const tagged = { ...item, media_type: inferMediaType(item) };
    const key = mediaItemKey(tagged);
    if (seen.has(key)) continue;
    seen.add(key);
    target.push({ item: tagged, tier, source });
    recordSource(sourceMap, tagged.id, source);
  }
}

function extractLinkedTitlesFromOverview(overview: string): string[] {
  if (!overview) return [];

  const titles = new Set<string>();
  const patterns = [
    /\bseen in (?:the )?([^.]+?)(?:\.|$)/i,
    /\bspin-?off (?:of|from|to) (?:the )?([^.]+?)(?:\.|$)/i,
    /\bprequel (?:of|from|to) (?:the )?([^.]+?)(?:\.|$)/i,
    /\bsequel (?:of|from|to) (?:the )?([^.]+?)(?:\.|$)/i,
    /\b(?:set in|takes place in|same universe as|part of) (?:the )?([^.]+?)(?:\.|$)/i,
    /\b(?:follows|following) (?:the )?([^.]+?)(?:\.|$)/i,
    /\b(?:companion to|sidequel to) (?:the )?([^.]+?)(?:\.|$)/i,
    /\b(?:character from|characters from) (?:the )?([^.]+?)(?:\.|$)/i,
  ];

  for (const pattern of patterns) {
    const match = overview.match(pattern);
    if (match?.[1]) {
      const title = match[1].trim().replace(/\s+/g, " ");
      if (title.length >= 4) titles.add(title);
    }
  }

  return [...titles];
}

function buildFranchiseSearchTerms(
  anchorTitle: string,
  details: Record<string, unknown>
): string[] {
  const terms = new Set<string>();

  const overview = typeof details.overview === "string" ? details.overview : "";
  for (const linked of extractLinkedTitlesFromOverview(overview)) {
    terms.add(linked);
  }

  const keywords = details.keywords as { results?: Array<{ name: string }> } | undefined;
  for (const kw of keywords?.results ?? []) {
    const name = kw.name?.trim();
    if (!name || name.length < 4) continue;
    if (/spin.?off|prequel|sequel|based on|character|sitcom|franchise/i.test(name)) continue;
    terms.add(name);
  }

  const collection = details.belongs_to_collection as { name?: string } | null | undefined;
  if (collection?.name && collection.name.length >= 4) {
    terms.add(collection.name);
  }

  const prefixStripped = anchorTitle
    .replace(/^(young|the new|new|late|early)\s+/i, "")
    .replace(/\s+(show|series)$/i, "")
    .trim();
  if (
    prefixStripped.length >= 4 &&
    prefixStripped.toLowerCase() !== anchorTitle.toLowerCase()
  ) {
    terms.add(prefixStripped);
  }

  const colonIndex = anchorTitle.indexOf(":");
  if (colonIndex > 4) {
    const parentTitle = anchorTitle.slice(0, colonIndex).trim();
    if (parentTitle.length >= 4) terms.add(parentTitle);
  }

  const subtitleMatch = anchorTitle.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (subtitleMatch?.[1] && subtitleMatch[1].trim().length >= 4) {
    terms.add(subtitleMatch[1].trim());
  }

  const words = prefixStripped.split(/\s+/).filter(Boolean);
  const lastName = words.at(-1);
  if (lastName && lastName.length >= 4 && words.length > 1) {
    terms.add(lastName);
  }

  return [...terms].slice(0, 8);
}

async function fetchCollectionAnchors(
  details: Record<string, unknown>,
  mediaType: MediaType,
  anchorId: number
): Promise<TmdbMediaItem[]> {
  if (mediaType !== "movie") return [];

  const collection = details.belongs_to_collection as { id?: number } | null | undefined;
  if (!collection?.id) return [];

  try {
    const data = await getCollection(collection.id);
    const anchors: TmdbMediaItem[] = [];
    for (const part of data.parts ?? []) {
      if (part.id === anchorId) continue;
      const brief = await getMediaItemBrief("movie", part.id);
      if (brief) anchors.push(brief);
    }
    return anchors;
  } catch {
    return [];
  }
}

async function fetchLinkedFranchiseMedia(
  anchorTitle: string,
  overview: string,
  anchorId: number,
  mediaType: MediaType,
  details: Record<string, unknown>
): Promise<{ anchors: TmdbMediaItem[]; related: TmdbMediaItem[] }> {
  const linkedTitles = extractLinkedTitlesFromOverview(overview);
  const anchors: TmdbMediaItem[] = [];
  const related: TmdbMediaItem[] = [];
  const seen = new Set<number>();

  const addAnchor = (item: TmdbMediaItem | null) => {
    if (!item || item.id === anchorId || seen.has(item.id)) return;
    seen.add(item.id);
    anchors.push({ ...item, media_type: mediaType });
  };

  const addRelated = (items: TmdbMediaItem[]) => {
    for (const item of items) {
      if (item.id === anchorId || seen.has(item.id)) continue;
      seen.add(item.id);
      related.push({ ...item, media_type: mediaType });
    }
  };

  for (const item of await fetchCollectionAnchors(details, mediaType, anchorId)) {
    addAnchor(item);
  }

  for (const title of linkedTitles) {
    const resolved = await resolveMediaTitle(title, mediaType);
    if (resolved) {
      addAnchor(await getMediaItemBrief(resolved.mediaType, resolved.tmdbId));
      try {
        const [recs, similar] = await Promise.all([
          getRecommendations(resolved.mediaType, resolved.tmdbId),
          getSimilar(resolved.mediaType, resolved.tmdbId),
        ]);
        addRelated([...recs.results, ...similar.results]);
      } catch {
        // skip if related fetch fails
      }
    }
  }

  for (const term of buildFranchiseSearchTerms(anchorTitle, { overview, ...details })) {
    if (linkedTitles.some((t) => t.toLowerCase().includes(term.toLowerCase()))) continue;
    try {
      const resolved = await resolveMediaTitle(term, mediaType);
      if (resolved) {
        addAnchor(await getMediaItemBrief(resolved.mediaType, resolved.tmdbId));
      }
    } catch {
      continue;
    }
  }

  return { anchors, related };
}

async function fetchRecommendationsMultiPage(
  mediaType: MediaType,
  tmdbId: number,
  pages = 3
): Promise<TmdbMediaItem[]> {
  const results: TmdbMediaItem[] = [];
  const seen = new Set<number>();

  for (let page = 1; page <= pages; page++) {
    try {
      const data = await getRecommendations(mediaType, tmdbId, page);
      for (const item of data.results) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        results.push(item);
      }
      if (page >= data.total_pages) break;
    } catch {
      break;
    }
  }

  return results;
}

function pinFranchiseAnchors(
  ranked: TmdbMediaItem[],
  anchors: TmdbMediaItem[],
  anchorId: number
): TmdbMediaItem[] {
  const pinnedIds = new Set(anchors.map((item) => item.id));
  const pinned = anchors.filter((item) => item.id !== anchorId);
  const rest = ranked.filter((item) => !pinnedIds.has(item.id) && item.id !== anchorId);
  return [...pinned, ...rest];
}

function rankMoreLikePool(items: RankedMoreLikeItem[]): TmdbMediaItem[] {
  return [...items]
    .filter(({ item }) => passesHomeLocaleFilter(item))
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      const localeDiff = localePriorityScore(b.item) - localePriorityScore(a.item);
      if (localeDiff !== 0) return localeDiff;
      const popDiff = (b.item.popularity ?? 0) - (a.item.popularity ?? 0);
      if (popDiff !== 0) return popDiff;
      return (b.item.vote_count ?? 0) - (a.item.vote_count ?? 0);
    })
    .map(({ item }) => item);
}

async function fetchCreatorRelatedMedia(
  creatorIds: number[],
  criteria: SearchCriteria,
  mediaType: MediaType
): Promise<TmdbMediaItem[]> {
  const results: TmdbMediaItem[] = [];
  const seen = new Set<number>();

  for (const creatorId of creatorIds.slice(0, 2)) {
    const filters = {
      ...buildDiscoverFiltersForChat(
        { ...criteria, mediaType, withCrew: [creatorId] },
        mediaType
      ),
      ...MORE_LIKE_LOCALE,
      sort_by: "popularity.desc",
    };
    const data =
      mediaType === "movie"
        ? await discoverMoviesMultiPage(filters, 2)
        : await discoverTvMultiPage(filters, 2);
    for (const item of data) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      results.push({ ...item, media_type: mediaType });
    }
  }

  return results;
}

async function fetchGenreFallbackMedia(
  genreIds: number[],
  criteria: SearchCriteria,
  mediaType: MediaType
): Promise<TmdbMediaItem[]> {
  if (!genreIds.length) return [];

  const filters = {
    ...buildDiscoverFiltersForChat(
      { ...criteria, mediaType, genres: genreIds },
      mediaType
    ),
    ...MORE_LIKE_LOCALE,
    sort_by: "popularity.desc",
  };
  const data =
    mediaType === "movie"
      ? await discoverMoviesMultiPage(filters, 2)
      : await discoverTvMultiPage(filters, 2);
  return tagMediaType(data, mediaType);
}

async function searchMediaByTitle(
  term: string,
  mediaType: MediaType
): Promise<TmdbMediaItem[]> {
  const search = mediaType === "movie" ? await searchMovie(term) : await searchTv(term);
  return search.results.slice(0, 8).map((item) => ({ ...item, media_type: mediaType }));
}

export async function browseMoreLikeMedia(
  criteria: SearchCriteria
): Promise<MoreLikeBrowseResult> {
  const itemSources = new Map<number, MoreLikeSource>();
  if (!criteria.moreLike) return { items: [], itemSources };

  const { mediaType, tmdbId, title: anchorTitle } = criteria.moreLike;
  const ranked: RankedMoreLikeItem[] = [];
  const seen = new Set<string>();

  const details =
    mediaType === "movie" ? await getMovieDetails(tmdbId) : await getTvDetails(tmdbId);
  const overview = typeof details.overview === "string" ? details.overview : "";

  const [recommendations, similar, linkedFranchise] = await Promise.all([
    fetchRecommendationsMultiPage(mediaType, tmdbId, 3),
    getSimilar(mediaType, tmdbId),
    fetchLinkedFranchiseMedia(anchorTitle, overview, tmdbId, mediaType, details),
  ]);

  mergeRankedItems(ranked, linkedFranchise.anchors, seen, "franchise-anchor", itemSources);
  mergeRankedItems(ranked, linkedFranchise.related, seen, "franchise", itemSources);
  mergeRankedItems(ranked, recommendations, seen, "recommendation", itemSources);

  const topRecs = recommendations.slice(0, 5);
  for (const related of topRecs) {
    try {
      const relatedTitle = getMediaTitle(related);
      if (relatedTitle.length >= 4) {
        mergeRankedItems(
          ranked,
          await searchMediaByTitle(relatedTitle, mediaType),
          seen,
          "recommendation",
          itemSources
        );
      }

      const [relRecs, relSimilar] = await Promise.all([
        getRecommendations(mediaType, related.id),
        getSimilar(mediaType, related.id),
      ]);
      mergeRankedItems(ranked, relRecs.results, seen, "franchise", itemSources);
      mergeRankedItems(ranked, relSimilar.results, seen, "franchise", itemSources);
    } catch {
      continue;
    }
  }

  const createdBy =
    (details.created_by as Array<{ id: number; name: string }> | undefined) ?? [];
  if (createdBy.length) {
    mergeRankedItems(
      ranked,
      await fetchCreatorRelatedMedia(
        createdBy.map((person) => person.id),
        criteria,
        mediaType
      ),
      seen,
      "creator",
      itemSources
    );
  }

  for (const term of buildFranchiseSearchTerms(anchorTitle, details)) {
    try {
      mergeRankedItems(
        ranked,
        await searchMediaByTitle(term, mediaType),
        seen,
        "search",
        itemSources
      );
    } catch {
      continue;
    }
  }

  mergeRankedItems(ranked, similar.results, seen, "similar", itemSources);

  const genreIds = ((details.genres as Array<{ id: number }> | undefined) ?? []).map(
    (genre) => genre.id
  );
  if (ranked.length < 24 && genreIds.length) {
    mergeRankedItems(
      ranked,
      await fetchGenreFallbackMedia(genreIds, criteria, mediaType),
      seen,
      "genre",
      itemSources
    );
  }

  const rankedPool = rankMoreLikePool(ranked).filter((item) => item.id !== tmdbId);
  const items = pinFranchiseAnchors(rankedPool, linkedFranchise.anchors, tmdbId);
  return { items, itemSources };
}

/** @deprecated Use browseMoreLikeMedia */
export async function browseMoreLikeShows(criteria: SearchCriteria): Promise<TmdbMediaItem[]> {
  return (await browseMoreLikeMedia(criteria)).items;
}

export function buildMoreLikeReason(
  item: TmdbMediaItem,
  anchorTitle: string,
  source?: MoreLikeSource
): string {
  const title = getMediaTitle(item);
  const anchorWords = anchorTitle
    .toLowerCase()
    .split(/[\s:,-]+/)
    .filter((w) => w.length > 3);
  const titleLower = title.toLowerCase();

  if (source === "franchise-anchor" || source === "franchise") {
    return `Part of the ${anchorTitle} universe`;
  }
  if (source === "creator") {
    return `From the same creator as ${anchorTitle}`;
  }
  if (anchorWords.some((word) => titleLower.includes(word))) {
    return `Part of the ${anchorTitle} universe`;
  }
  return `Similar to ${anchorTitle}`;
}
