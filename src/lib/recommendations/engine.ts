import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  userPreferences,
  recommendationProfiles,
  watchHistoryCache,
  plexLibraryCache,
} from "@/lib/db/schema";
import {
  getPopularMovies,
  getPopularTv,
  getTrending,
  getSimilar,
  getRecommendations,
  discoverMovies,
  discoverTv,
  buildDiscoverFilters,
  getMediaItemBrief,
  getMovieDetails,
  getTvDetails,
} from "@/lib/integrations/tmdb/client";
import { getMediaTitle, mediaItemKey } from "@/lib/integrations/tmdb/helpers";
import { rerankRecommendations } from "@/lib/ai/provider";
import {
  FOR_YOU_CANDIDATE_POOL,
  FOR_YOU_DB_CACHE_TTL_MS,
  FOR_YOU_ITEMS_PER_SEED,
  FOR_YOU_LIBRARY_SEED_LIMIT,
  FOR_YOU_LIKED_SEED_LIMIT,
  FOR_YOU_MAX_BROWSE_IN_ROW,
  FOR_YOU_MAX_PER_SEED_IN_ROW,
  FOR_YOU_NO_REPEAT_ROW_COUNT,
  FOR_YOU_MEMORY_CACHE_TTL_MS,
  FOR_YOU_POPULAR_BROWSE_LIMIT,
  FOR_YOU_POPULAR_SCORE_BOOST,
  FOR_YOU_RECENT_YEARS,
  FOR_YOU_TRENDING_LEAD_SLOTS,
  FOR_YOU_TRENDING_SCORE_BOOST,
  FOR_YOU_EXTENDED_YEARS,
  FOR_YOU_QUALITY_MIN_TMDB_RATING,
  FOR_YOU_QUALITY_MIN_VOTE_COUNT,
  FOR_YOU_RERANK_CHUNK_SIZE,
  FOR_YOU_RERANK_LIMIT,
  FOR_YOU_WATCH_SEED_LIMIT,
  HOME_ROW_LIMIT,
  HOME_BROWSE_RERANK_LIMIT,
  LIKED_SEED_SCORE_BOOST,
  PERSONALIZE_CACHE_TTL_MS,
  PERSONALIZE_RERANK_PARALLEL,
  SEED_SCORE_BOOST,
} from "./constants";
import { fetchCandidateRtRatings } from "./fetch-candidate-ratings";
import {
  clearForYouDbCache,
  deleteForYouDbCacheEntry,
  getForYouDbCache,
  setForYouDbCache,
} from "./for-you-cache";
import {
  enrichItemsWithStatus,
  filterMediaItems,
  getHiddenIds,
  getWatchedIds,
  getFullyWatchedIds,
  getLibraryIds,
  getStatusIdSets,
  scoreItem,
} from "./filters";
import { normalizeChatCriteria } from "./normalize-criteria";
import {
  blendPersonalAndQuality,
  qualityPercentForItem,
  type CandidateRtRatings,
} from "./quality-score";
import { listLikedMedia, listLikedPeople } from "@/lib/liked-list";
import {
  compareByLocalePreference,
  passesHomeLocaleFilter,
  prioritizeHomeLocaleItems,
  withUsUkEnglishDiscoverFilters,
} from "./locale-priority";
import type { MediaType, RecommendationItem, SearchCriteria, TmdbMediaItem } from "@/types";

type PrefetchedBrowse = {
  trending?: TmdbMediaItem[];
  popularMovies?: TmdbMediaItem[];
  popularTv?: TmdbMediaItem[];
};

const FOR_YOU_CACHE_TTL_MS = FOR_YOU_MEMORY_CACHE_TTL_MS;

type ForYouCacheEntry = {
  expiresAt: number;
  data: RecommendationItem[];
};

const forYouCache = new Map<string, ForYouCacheEntry>();
/** Last N served For You rows per user (newest first) — used to suppress repeats on refresh. */
const recentForYouRowsByUser = new Map<string, number[][]>();

type PersonalizeFiltersCacheEntry = {
  expiresAt: number;
  taste: Awaited<ReturnType<typeof loadTasteProfile>>;
  hiddenIds: Awaited<ReturnType<typeof getHiddenIds>>;
  watchedIds: Awaited<ReturnType<typeof getWatchedIds>>;
  fullyWatchedIds: Awaited<ReturnType<typeof getFullyWatchedIds>>;
  libraryIds: Awaited<ReturnType<typeof getLibraryIds>>;
};

type PersonalizeResultCacheEntry = {
  expiresAt: number;
  items: RecommendationItem[];
};

const personalizeFiltersCache = new Map<string, PersonalizeFiltersCacheEntry>();
const personalizeResultCache = new Map<string, PersonalizeResultCacheEntry>();

function personalizeResultCacheKey(userId: string, items: TmdbMediaItem[]): string {
  const ids = items
    .map((item) => item.id)
    .filter((id) => Number.isFinite(id))
    .sort((a, b) => a - b)
    .join(",");
  return `${userId}:${ids}`;
}

async function loadPersonalizeFilters(userId: string): Promise<PersonalizeFiltersCacheEntry> {
  const cached = personalizeFiltersCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached;
  }

  const [prefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  const usernames = prefs?.tautulliUsernames ?? [];

  const [taste, hiddenIds, watchedIds, fullyWatchedIds, libraryIds] = await Promise.all([
    loadTasteProfile(userId),
    getHiddenIds(userId),
    getWatchedIds(usernames),
    getFullyWatchedIds(usernames),
    getLibraryIds(),
  ]);

  const entry: PersonalizeFiltersCacheEntry = {
    expiresAt: Date.now() + PERSONALIZE_CACHE_TTL_MS,
    taste,
    hiddenIds,
    watchedIds,
    fullyWatchedIds,
    libraryIds,
  };
  personalizeFiltersCache.set(userId, entry);
  return entry;
}

/** Pre-load taste/filter data so the first home-row personalize click is faster. */
export async function warmPersonalizeBrowseContext(userId: string): Promise<void> {
  await loadPersonalizeFilters(userId);
}

function rowIdSignature(ids: number[]): string {
  return ids.slice().sort((a, b) => a - b).join(",");
}

function rememberForYouRow(userId: string, items: RecommendationItem[]) {
  const ids = items.map((item) => item.id);
  if (ids.length === 0) return;

  const history = recentForYouRowsByUser.get(userId) ?? [];
  const signature = rowIdSignature(ids);
  if (history.length > 0 && rowIdSignature(history[0]) === signature) return;

  history.unshift(ids);
  if (history.length > FOR_YOU_NO_REPEAT_ROW_COUNT) {
    history.length = FOR_YOU_NO_REPEAT_ROW_COUNT;
  }
  recentForYouRowsByUser.set(userId, history);
}

function getForYouExcludeIds(userId: string, refresh: boolean): Set<number> {
  if (!refresh) return new Set();
  const exclude = new Set<number>();
  for (const row of recentForYouRowsByUser.get(userId) ?? []) {
    for (const id of row) exclude.add(id);
  }
  return exclude;
}

export function clearForYouRecommendationCache(userId?: string) {
  if (!userId) {
    forYouCache.clear();
    recentForYouRowsByUser.clear();
    void clearForYouDbCache();
    return;
  }
  for (const key of forYouCache.keys()) {
    if (key.startsWith(`${userId}:`)) {
      forYouCache.delete(key);
    }
  }
  recentForYouRowsByUser.delete(userId);
  void clearForYouDbCache(userId);
}

function forYouCacheKey(
  userId: string,
  criteria: SearchCriteria,
  limit: number,
  prefetchedBrowse?: PrefetchedBrowse,
  refreshCount = 0,
  refreshGeneration = 0
): string {
  const browseKey = prefetchedBrowse
    ? `${prefetchedBrowse.trending?.length ?? 0}:${prefetchedBrowse.popularMovies?.length ?? 0}:${prefetchedBrowse.popularTv?.length ?? 0}`
    : "none";
  return `${userId}:${limit}:${refreshCount}:${refreshGeneration}:${browseKey}:${JSON.stringify(criteria)}`;
}

type RecommendationSeed =
  | { kind: "watched"; title: string }
  | { kind: "library"; title: string }
  | { kind: "similar"; title: string }
  | { kind: "liked"; title: string }
  | { kind: "liked_person"; title: string };

const GENERIC_REASONS = [
  "Based on your viewing history and preferences",
  "Matches your preferences",
];

function isGenericReason(reason?: string): boolean {
  if (!reason?.trim()) return true;
  if (GENERIC_REASONS.some((generic) => reason.includes(generic))) return true;
  if (/"[\s]*"/.test(reason)) return true;
  return false;
}

function validTitles(titles: string[]): string[] {
  return titles.map((t) => t?.trim()).filter((t): t is string => Boolean(t));
}

export function buildRecommendationReason(
  seed: RecommendationSeed | undefined,
  taste: { recentTitles: string[] },
  itemId?: number
): string {
  if (seed?.title?.trim()) {
    if (seed.kind === "watched") {
      return `Because you watched "${seed.title.trim()}"`;
    }
    if (seed.kind === "library") {
      return `Because you have "${seed.title.trim()}" in your Plex library`;
    }
    if (seed.kind === "similar") {
      return `Similar to "${seed.title.trim()}"`;
    }
    if (seed.kind === "liked") {
      return `Because you liked "${seed.title.trim()}"`;
    }
    if (seed.kind === "liked_person") {
      return `Because you liked "${seed.title.trim()}"`;
    }
  }
  const titles = validTitles(taste.recentTitles);
  if (titles.length > 0) {
    const idx = itemId != null ? itemId % titles.length : 0;
    return `Because you enjoy "${titles[idx]}"`;
  }
  return "Popular pick that matches your taste";
}

export function generateTasteSummary(profile: {
  genres: Record<string, number>;
  decades: Record<string, number>;
  watchCount: number;
  recentTitles: string[];
  likedTitles?: string[];
  likedPeople?: string[];
  familiarCreators?: string[];
  familiarActors?: string[];
}): string {
  const topGenres = Object.entries(profile.genres)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => `genre ${id} (${count})`);
  const topDecades = Object.entries(profile.decades)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([decade, count]) => `${decade} (${count})`);

  return [
    `Recent watches: ${profile.recentTitles.join(", ") || "none"}.`,
    `Total watched: ${profile.watchCount}.`,
    profile.likedTitles?.length
      ? `Liked titles: ${profile.likedTitles.join(", ")}.`
      : "",
    profile.likedPeople?.length
      ? `Liked people: ${profile.likedPeople.join(", ")}.`
      : "",
    profile.familiarCreators?.length
      ? `Creators/writers from your watch history, library, and likes: ${profile.familiarCreators.join(", ")}.`
      : "",
    profile.familiarActors?.length
      ? `Actors you often watch: ${profile.familiarActors.join(", ")}.`
      : "",
    topGenres.length ? `Top genres: ${topGenres.join(", ")}.` : "",
    topDecades.length ? `Preferred decades: ${topDecades.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export async function buildTasteProfile(userId: string) {
  const [prefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  const usernames = prefs?.tautulliUsernames ?? [];
  const history = await db.select().from(watchHistoryCache);
  const userHistory = history
    .filter((h) => usernames.includes(h.tautulliUsername))
    .sort((a, b) => (b.watchedAt?.getTime() ?? 0) - (a.watchedAt?.getTime() ?? 0));

  const likedMedia = await listLikedMedia(userId);
  const likedPeople = await listLikedPeople(userId);

  const genres: Record<string, number> = {};
  const decades: Record<string, number> = {};

  const uniqueRecent = [
    ...new Map(userHistory.map((h) => [`${h.mediaType}:${h.tmdbId}`, h])).values(),
  ].slice(0, 15);

  const uniqueLiked = likedMedia.slice(0, 10);

  const detailResults = await Promise.all(
    [...uniqueRecent, ...uniqueLiked.map((item) => ({ mediaType: item.kind, tmdbId: item.tmdbId }))].map(
      async (item) => {
      try {
        const details =
          item.mediaType === "movie"
            ? await getMovieDetails(item.tmdbId)
            : await getTvDetails(item.tmdbId);
        const detailGenres = (details.genres as Array<{ id: number }>) ?? [];
        const date = (details.release_date ?? details.first_air_date) as string | undefined;
        return { detailGenres, date };
      } catch {
        return null;
      }
    })
  );

  for (const result of detailResults) {
    if (!result) continue;
    for (const g of result.detailGenres) {
      genres[String(g.id)] = (genres[String(g.id)] ?? 0) + 1;
    }
    if (result.date) {
      const decade = `${result.date.slice(0, 3)}0s`;
      decades[decade] = (decades[decade] ?? 0) + 1;
    }
  }

  const profile = {
    genres,
    decades,
    avgRating: 7,
    watchCount: userHistory.length,
    recentTitles: validTitles(userHistory.slice(0, 10).map((h) => h.title)),
    likedTitles: validTitles(likedMedia.map((item) => item.title)),
    likedPeople: validTitles(likedPeople.map((item) => item.title)),
  };

  const existing = await db
    .select()
    .from(recommendationProfiles)
    .where(eq(recommendationProfiles.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(recommendationProfiles)
      .set({ genres, decades, updatedAt: new Date() })
      .where(eq(recommendationProfiles.userId, userId));
  } else {
    await db.insert(recommendationProfiles).values({ userId, genres, decades });
  }

  return profile;
}

export async function loadTasteProfile(userId: string) {
  const [prefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  const usernames = prefs?.tautulliUsernames ?? [];
  const history = await db.select().from(watchHistoryCache);
  const userHistory = history
    .filter((h) => usernames.includes(h.tautulliUsername))
    .sort((a, b) => (b.watchedAt?.getTime() ?? 0) - (a.watchedAt?.getTime() ?? 0));

  const likedMedia = await listLikedMedia(userId);
  const likedPeople = await listLikedPeople(userId);

  const [profile] = await db
    .select()
    .from(recommendationProfiles)
    .where(eq(recommendationProfiles.userId, userId))
    .limit(1);

  return {
    genres: (profile?.genres as Record<string, number>) ?? {},
    decades: (profile?.decades as Record<string, number>) ?? {},
    avgRating: profile?.avgRating ?? 7,
    watchCount: userHistory.length,
    recentTitles: validTitles(userHistory.slice(0, 10).map((h) => h.title)),
    likedTitles: validTitles(likedMedia.map((item) => item.title)),
    likedPeople: validTitles(likedPeople.map((item) => item.title)),
  };
}

function hasActiveChatCriteria(criteria: SearchCriteria): boolean {
  return Boolean(
    criteria.mediaType ||
      criteria.genres?.length ||
      criteria.keywords?.length ||
      criteria.withKeywords ||
      criteria.mood ||
      criteria.moreLike ||
      criteria.dateMin ||
      criteria.dateMax ||
      criteria.yearMin ||
      criteria.yearMax ||
      criteria.minRating ||
      criteria.runtimeMin ||
      criteria.runtimeMax ||
      criteria.language
  );
}

function uniqueKeywordStrings(keywords: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const keyword of keywords) {
    const trimmed = keyword.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

async function buildMergedForYouCriteria(
  prefs:
    | {
        chatCriteria?: Record<string, unknown> | null;
        recommendationKeywords?: string[] | null;
      }
    | undefined,
  criteria: SearchCriteria = {}
): Promise<SearchCriteria> {
  const base: SearchCriteria = {
    excludeHidden: true,
    excludeWatched: true,
    excludeInLibrary: true,
    ...criteria,
  };

  const chatRaw = (prefs?.chatCriteria as Record<string, unknown>) ?? {};
  const chatKeywords = Array.isArray(chatRaw.keywords)
    ? chatRaw.keywords.filter((k): k is string => typeof k === "string")
    : [];
  const settingKeywords = prefs?.recommendationKeywords ?? [];
  const keywordStrings = uniqueKeywordStrings([...settingKeywords, ...chatKeywords]);

  if (keywordStrings.length === 0 && Object.keys(chatRaw).length === 0) {
    return base;
  }

  const normalized = await normalizeChatCriteria({
    ...chatRaw,
    keywords: keywordStrings,
  });

  return {
    ...base,
    ...normalized,
    keywords: keywordStrings.length ? keywordStrings : undefined,
  };
}

async function getFilteredWatchHistoryLength(usernames: string[]): Promise<number> {
  if (usernames.length === 0) return 0;
  const history = await db.select().from(watchHistoryCache);
  return history.filter(
    (h) => usernames.includes(h.tautulliUsername) && h.title?.trim()
  ).length;
}

function randomWatchSeedOffset(historyLength: number): number {
  if (historyLength <= 0) return 0;
  return Math.floor(Math.random() * historyLength);
}

async function resolveForYouSeedOffset(
  usernames: string[],
  explicitOffset?: number,
  refreshGeneration = 0
): Promise<number> {
  if (explicitOffset != null) return explicitOffset;
  const historyLength = await getFilteredWatchHistoryLength(usernames);
  if (historyLength <= 0) return refreshGeneration;
  if (refreshGeneration > 0) {
    return refreshGeneration % historyLength;
  }
  return randomWatchSeedOffset(historyLength);
}

function seedScoreBoost(seed: RecommendationSeed | undefined): number {
  if (!seed) return 0;
  if (seed.kind === "liked" || seed.kind === "liked_person") return LIKED_SEED_SCORE_BOOST;
  return SEED_SCORE_BOOST;
}

type SeedBatch = { items: TmdbMediaItem[]; seed: RecommendationSeed };

function seedGroupKey(seed: RecommendationSeed): string {
  return `${seed.kind}:${seed.title.trim().toLowerCase()}`;
}

function interleaveSeedBatches(batches: SeedBatch[], seedOffset: number): SeedBatch[] {
  const byKind = new Map<string, SeedBatch[]>();
  for (const batch of batches) {
    const list = byKind.get(batch.seed.kind) ?? [];
    list.push(batch);
    byKind.set(batch.seed.kind, list);
  }

  const kindOrder = ["watched", "library", "liked", "liked_person", "similar"] as const;
  const queues = kindOrder
    .map((kind) => shuffleWithSeed(byKind.get(kind) ?? [], seedOffset))
    .filter((queue) => queue.length > 0);

  const interleaved: SeedBatch[] = [];
  let progress = true;
  while (progress) {
    progress = false;
    for (const queue of queues) {
      const next = queue.shift();
      if (next) {
        interleaved.push(next);
        progress = true;
      }
    }
  }

  return interleaved;
}

function shuffleWithSeed<T>(items: T[], seed: number): T[] {
  const arr = [...items];
  let state = (seed + 1) | 0;
  for (let i = arr.length - 1; i > 0; i--) {
    state = (state * 1103515245 + 12345) | 0;
    const j = ((state >>> 0) % (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickWatchHistorySeeds(
  history: Array<{ mediaType: MediaType; tmdbId: number; title: string; watchedAt: Date | null }>,
  watchLimit: number,
  seedOffset: number
) {
  const unique = [
    ...new Map(
      history
        .filter((watch) => watch.title?.trim())
        .map((watch) => [`${watch.mediaType}:${watch.tmdbId}`, watch])
    ).values(),
  ];
  if (unique.length === 0) return [];
  const shuffled = shuffleWithSeed(unique, seedOffset);
  return shuffled.slice(0, Math.min(watchLimit, shuffled.length));
}

function popularityHeuristicBoost(item: TmdbMediaItem): number {
  let boost = 0;
  if (item.popularity != null && item.popularity > 0) {
    boost += Math.min(7, Math.log10(item.popularity + 1) * 1.8);
  }
  if (item.vote_count != null && item.vote_count >= 100) {
    boost += Math.min(3, Math.log10(item.vote_count) * 0.8);
  }
  return boost;
}

function compareByPopularityDesc(a: TmdbMediaItem, b: TmdbMediaItem): number {
  const popDiff = (b.popularity ?? 0) - (a.popularity ?? 0);
  if (popDiff !== 0) return popDiff;
  return (b.vote_count ?? 0) - (a.vote_count ?? 0);
}

function hotTitleBoost(
  key: string,
  trendingKeys: Set<string>,
  popularKeys: Set<string>
): number {
  if (trendingKeys.has(key)) return FOR_YOU_TRENDING_SCORE_BOOST;
  if (popularKeys.has(key)) return FOR_YOU_POPULAR_SCORE_BOOST;
  return 0;
}

function getItemReleaseYear(item: TmdbMediaItem): number | null {
  const date = item.release_date ?? item.first_air_date;
  if (!date) return null;
  const year = Number.parseInt(date.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

export function getForYouMinReleaseYear(refreshCount: number): number | null {
  const currentYear = new Date().getFullYear();
  if (refreshCount <= 0) return currentYear - FOR_YOU_RECENT_YEARS;
  if (refreshCount === 1) return currentYear - FOR_YOU_EXTENDED_YEARS;
  return null;
}

function isWithinForYouRecencyWindow(item: TmdbMediaItem, refreshCount: number): boolean {
  const minYear = getForYouMinReleaseYear(refreshCount);
  if (minYear == null) return true;
  const year = getItemReleaseYear(item);
  if (year == null) return true;
  return year >= minYear;
}

function recencyHeuristicBoost(item: TmdbMediaItem, refreshCount: number): number {
  const year = getItemReleaseYear(item);
  if (year == null) return 0;

  const age = new Date().getFullYear() - year;
  if (refreshCount <= 0) {
    if (age <= 2) return 5;
    if (age <= FOR_YOU_RECENT_YEARS) return 3;
    return -12;
  }
  if (refreshCount === 1) {
    if (age <= 2) return 3;
    if (age <= FOR_YOU_RECENT_YEARS) return 2;
    if (age <= FOR_YOU_EXTENDED_YEARS) return 0;
    return -4;
  }
  if (age <= FOR_YOU_RECENT_YEARS) return 1;
  return 0;
}

function compareByReleaseYearDesc(a: TmdbMediaItem, b: TmdbMediaItem): number {
  const yearA = getItemReleaseYear(a) ?? 0;
  const yearB = getItemReleaseYear(b) ?? 0;
  return yearB - yearA;
}

function applyForYouRecencyToCriteria(
  criteria: SearchCriteria,
  refreshCount: number
): SearchCriteria {
  const minYear = getForYouMinReleaseYear(refreshCount);
  if (minYear == null) return criteria;

  const recencyMin = `${minYear}-01-01`;
  if (criteria.dateMin && criteria.dateMin > recencyMin) return criteria;
  return { ...criteria, dateMin: criteria.dateMin ?? recencyMin };
}

function mergeSeedBatchesRoundRobin(
  batches: SeedBatch[],
  filterOpts: Parameters<typeof filterMediaItems>[1],
  perSeedCap: number,
  seedOffset = 0
): { candidates: TmdbMediaItem[]; seeds: Map<string, RecommendationSeed> } {
  const filtered = batches
    .map((batch) => ({
      seed: batch.seed,
      items: filterMediaItems(batch.items, filterOpts),
    }))
    .filter((batch) => batch.items.length > 0);

  const seeds = new Map<string, RecommendationSeed>();
  const candidates: TmdbMediaItem[] = [];
  const seen = new Set<string>();
  const seedCounts = new Map<string, number>();
  const cursors = filtered.map((batch) =>
    batch.items.length > 0 ? seedOffset % batch.items.length : 0
  );

  let progress = true;
  while (progress) {
    progress = false;
    for (let i = 0; i < filtered.length; i++) {
      const groupKey = seedGroupKey(filtered[i].seed);
      if ((seedCounts.get(groupKey) ?? 0) >= perSeedCap) continue;

      while (cursors[i] < filtered[i].items.length) {
        const item = filtered[i].items[cursors[i]++];
        const key = mediaItemKey(item);
        if (seen.has(key)) continue;

        seen.add(key);
        candidates.push(item);
        seeds.set(key, filtered[i].seed);
        seedCounts.set(groupKey, (seedCounts.get(groupKey) ?? 0) + 1);
        progress = true;
        break;
      }
    }
  }

  return { candidates, seeds };
}

function selectCandidatesForRerank(
  scored: ScoredForYouItem[],
  seeds: Map<string, RecommendationSeed>,
  limit: number
): ScoredForYouItem[] {
  const groups = new Map<string, ScoredForYouItem[]>();
  for (const entry of scored) {
    const seed = seeds.get(mediaItemKey(entry.item));
    const key = seed ? seedGroupKey(seed) : "browse";
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }

  for (const list of groups.values()) {
    list.sort((a, b) => b.score - a.score);
  }

  const selected: ScoredForYouItem[] = [];
  const seenIds = new Set<number>();
  const groupLists = [...groups.values()];
  let round = 0;

  while (selected.length < limit) {
    let added = false;
    for (const list of groupLists) {
      if (round >= list.length || selected.length >= limit) continue;
      const entry = list[round];
      if (seenIds.has(entry.item.id)) continue;
      seenIds.add(entry.item.id);
      selected.push(entry);
      added = true;
    }
    if (!added) break;
    round++;
  }

  if (selected.length < limit) {
    for (const entry of scored) {
      if (selected.length >= limit) break;
      if (seenIds.has(entry.item.id)) continue;
      seenIds.add(entry.item.id);
      selected.push(entry);
    }
  }

  return selected;
}

async function fetchLikedSeedBatches(userId: string, seedOffset = 0): Promise<SeedBatch[]> {
  const [likedMedia, likedPeople] = await Promise.all([
    listLikedMedia(userId),
    listLikedPeople(userId),
  ]);

  const batches: SeedBatch[] = [];

  const shuffledLikedMedia = shuffleWithSeed(
    likedMedia.filter((item) => item.title?.trim()),
    seedOffset
  ).slice(0, FOR_YOU_LIKED_SEED_LIMIT);

  const likedTitleResults = await Promise.all(
    shuffledLikedMedia.map(async (liked) => {
        const mediaType = liked.kind as MediaType;
        try {
          const [similar, recs] = await Promise.all([
            getSimilar(mediaType, liked.tmdbId),
            getRecommendations(mediaType, liked.tmdbId),
          ]);
          return {
            items: [...similar.results, ...recs.results],
            seed: { kind: "liked" as const, title: liked.title.trim() },
          };
        } catch {
          return null;
        }
      })
  );

  for (const result of likedTitleResults) {
    if (result) batches.push(result);
  }

  const shuffledLikedPeople = shuffleWithSeed(
    likedPeople.filter((person) => person.title?.trim()),
    seedOffset + 17
  ).slice(0, FOR_YOU_LIKED_SEED_LIMIT);

  const likedPersonResults = await Promise.all(
    shuffledLikedPeople.map(async (person) => {
        try {
          const [movieResults, tvResults] = await Promise.all([
            discoverMovies(buildDiscoverFilters({ withCast: [person.tmdbId] }, "movie")),
            discoverTv(buildDiscoverFilters({ withCast: [person.tmdbId] }, "tv")),
          ]);
          return {
            items: [...movieResults.results, ...tvResults.results],
            seed: { kind: "liked_person" as const, title: person.title.trim() },
          };
        } catch {
          return null;
        }
      })
  );

  for (const result of likedPersonResults) {
    if (result) batches.push(result);
  }

  return batches;
}

function buildQualityDiscoverFilters(criteria: SearchCriteria, mediaType: MediaType) {
  return {
    ...buildDiscoverFilters(
      {
        ...criteria,
        minRating: Math.max(criteria.minRating ?? 0, FOR_YOU_QUALITY_MIN_TMDB_RATING),
      },
      mediaType
    ),
    sort_by: "vote_average.desc",
    "vote_count.gte": String(FOR_YOU_QUALITY_MIN_VOTE_COUNT),
  };
}

function buildRerankCandidates(
  scored: Array<{ item: TmdbMediaItem }>,
  rtMap: Map<number, CandidateRtRatings>,
  seeds: Map<string, RecommendationSeed>
) {
  return scored.map(({ item }) => {
    const rt = rtMap.get(item.id);
    const seed = seeds.get(mediaItemKey(item));
    return {
      id: item.id,
      title: getMediaTitle(item),
      overview: item.overview?.slice(0, 160),
      tmdbRating: item.vote_average,
      popularity: item.popularity,
      voteCount: item.vote_count,
      rtCriticsScore: rt?.rtCritics,
      rtAudienceScore: rt?.rtAudience,
      seedKind: seed?.kind,
      seedTitle: seed?.title,
    };
  });
}

function sortForYouItemsByScoreAndRecency(
  a: RecommendationItem,
  b: RecommendationItem,
  refreshCount: number
): number {
  const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
  if (scoreDiff !== 0) return scoreDiff;
  const popularityDiff = compareByPopularityDesc(a, b);
  if (popularityDiff !== 0) return popularityDiff;
  if (refreshCount <= 1) {
    const recencyDiff = compareByReleaseYearDesc(a, b);
    if (recencyDiff !== 0) return recencyDiff;
  }
  return compareByLocalePreference(a, b);
}

function pickDiverseForYouRowInner(
  items: RecommendationItem[],
  seeds: Map<string, RecommendationSeed>,
  limit: number,
  refreshCount: number
): RecommendationItem[] {
  const groups = new Map<string, RecommendationItem[]>();

  for (const item of items) {
    const seed = seeds.get(mediaItemKey(item));
    const groupKey = seed ? seedGroupKey(seed) : "browse";
    const list = groups.get(groupKey) ?? [];
    list.push(item);
    groups.set(groupKey, list);
  }

  const orderedGroups = [...groups.entries()]
    .map(([key, groupItems]) => ({
      key,
      kind: key === "browse" ? "browse" : key.split(":")[0],
      items: groupItems.sort((a, b) => sortForYouItemsByScoreAndRecency(a, b, refreshCount)),
    }))
    .sort((a, b) => {
      const kindOrder: Record<string, number> = {
        watched: 0,
        library: 1,
        liked: 2,
        liked_person: 3,
        similar: 4,
        browse: 5,
      };
      const kindDiff = (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9);
      if (kindDiff !== 0) return kindDiff;
      return (b.items[0]?.score ?? 0) - (a.items[0]?.score ?? 0);
    });

  const picked: RecommendationItem[] = [];
  const counts = new Map<string, number>();
  const cursors = new Map<string, number>();
  let progress = true;

  while (picked.length < limit && progress) {
    progress = false;
    for (const group of orderedGroups) {
      if (picked.length >= limit) break;

      const count = counts.get(group.key) ?? 0;
      const maxForGroup =
        group.key === "browse" ? FOR_YOU_MAX_BROWSE_IN_ROW : FOR_YOU_MAX_PER_SEED_IN_ROW;
      if (count >= maxForGroup) continue;

      const cursor = cursors.get(group.key) ?? 0;
      if (cursor >= group.items.length) continue;

      picked.push(group.items[cursor]);
      cursors.set(group.key, cursor + 1);
      counts.set(group.key, count + 1);
      progress = true;
    }
  }

  return picked;
}

function pickDiverseForYouRow(
  items: RecommendationItem[],
  seeds: Map<string, RecommendationSeed>,
  limit: number,
  refreshCount = 0,
  trendingKeys: Set<string> = new Set(),
  popularKeys: Set<string> = new Set()
): RecommendationItem[] {
  const isHot = (item: RecommendationItem) => {
    const key = mediaItemKey(item);
    return trendingKeys.has(key) || popularKeys.has(key);
  };

  const hotSorted = items
    .filter(isHot)
    .sort((a, b) => sortForYouItemsByScoreAndRecency(a, b, refreshCount));

  const leadCount = Math.min(FOR_YOU_TRENDING_LEAD_SLOTS, limit, hotSorted.length);
  const lead = hotSorted.slice(0, leadCount);
  const leadIds = new Set(lead.map((item) => item.id));

  if (lead.length >= limit) return lead;

  const remainder = items.filter((item) => !leadIds.has(item.id));
  const diverse = pickDiverseForYouRowInner(
    remainder,
    seeds,
    limit - lead.length,
    refreshCount
  );
  return [...lead, ...diverse];
}

async function generatePersonalSeedCandidates(
  usernames: string[],
  filterOpts: Parameters<typeof filterMediaItems>[1],
  seedOffset: number,
  watchLimit: number,
  includeLibrarySeeds = true,
  userId?: string
): Promise<{ candidates: TmdbMediaItem[]; seeds: Map<string, RecommendationSeed> }> {
  const batches: SeedBatch[] = [];

  const history = await db.select().from(watchHistoryCache);
  const userHistory = history
    .filter((h) => usernames.includes(h.tautulliUsername))
    .sort((a, b) => (b.watchedAt?.getTime() ?? 0) - (a.watchedAt?.getTime() ?? 0));

  const watchSeeds = pickWatchHistorySeeds(userHistory, watchLimit, seedOffset);

  const watchSeedResults = await Promise.all(
    watchSeeds.map(async (watch) => {
      try {
        const [similar, recs] = await Promise.all([
          getSimilar(watch.mediaType, watch.tmdbId),
          getRecommendations(watch.mediaType, watch.tmdbId),
        ]);
        return {
          items: [...similar.results, ...recs.results],
          seed: { kind: "watched" as const, title: watch.title.trim() },
        };
      } catch {
        return null;
      }
    })
  );

  for (const result of watchSeedResults) {
    if (result) batches.push(result);
  }

  if (includeLibrarySeeds) {
    const libraryRows = await db
      .select()
      .from(plexLibraryCache)
      .where(eq(plexLibraryCache.inLibrary, true));

    const librarySeeds = shuffleWithSeed(
      libraryRows.filter((lib) => lib.title?.trim()),
      seedOffset + 31
    ).slice(0, FOR_YOU_LIBRARY_SEED_LIMIT);

    const librarySeedResults = await Promise.all(
      librarySeeds.map(async (lib) => {
          try {
            const [similar, recs] = await Promise.all([
              getSimilar(lib.mediaType, lib.tmdbId),
              getRecommendations(lib.mediaType, lib.tmdbId),
            ]);
            return {
              items: [...similar.results, ...recs.results],
              seed: { kind: "library" as const, title: lib.title.trim() },
            };
          } catch {
            return null;
          }
        })
    );

    for (const result of librarySeedResults) {
      if (result) batches.push(result);
    }
  } else if (userId) {
    batches.push(...(await fetchLikedSeedBatches(userId, seedOffset)));
    return mergeSeedBatchesRoundRobin(
      interleaveSeedBatches(batches, seedOffset),
      filterOpts,
      FOR_YOU_ITEMS_PER_SEED,
      seedOffset
    );
  }

  if (userId) {
    batches.push(...(await fetchLikedSeedBatches(userId, seedOffset)));
  }

  return mergeSeedBatchesRoundRobin(
    interleaveSeedBatches(batches, seedOffset),
    filterOpts,
    FOR_YOU_ITEMS_PER_SEED,
    seedOffset
  );
}

type ScoredForYouItem = { item: TmdbMediaItem; score: number };

function getHeuristicScoreRange(scored: ScoredForYouItem[]): { min: number; max: number } {
  if (scored.length === 0) return { min: 0, max: 100 };
  let min = Infinity;
  let max = -Infinity;
  for (const { score } of scored) {
    min = Math.min(min, score);
    max = Math.max(max, score);
  }
  return { min, max };
}

function toMatchPercent(score: number, min: number, max: number): number {
  if (max <= min) return 100;
  return Math.max(0, Math.min(100, Math.round(((score - min) / (max - min)) * 100)));
}

function clampMatchPercent(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreCandidatesForYou(
  candidates: TmdbMediaItem[],
  seeds: Map<string, RecommendationSeed>,
  taste: Awaited<ReturnType<typeof loadTasteProfile>>,
  mergedCriteria: SearchCriteria,
  refreshCount = 0,
  trendingKeys: Set<string> = new Set(),
  popularKeys: Set<string> = new Set()
): ScoredForYouItem[] {
  const eligible = (
    refreshCount <= 0
      ? candidates.filter((item) => isWithinForYouRecencyWindow(item, refreshCount))
      : candidates
  ).filter(passesHomeLocaleFilter);

  return eligible
    .map((item) => {
      const key = mediaItemKey(item);
      return {
        item,
        score:
          scoreItem(
            item,
            {
              genres: taste.genres,
              decades: taste.decades,
              avgRating: taste.avgRating,
            },
            mergedCriteria
          ) +
          seedScoreBoost(seeds.get(key)) +
          popularityHeuristicBoost(item) +
          hotTitleBoost(key, trendingKeys, popularKeys) +
          recencyHeuristicBoost(item, refreshCount),
      };
    })
    .sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;
      const popularityDiff = compareByPopularityDesc(b.item, a.item);
      if (popularityDiff !== 0) return popularityDiff;
      if (refreshCount <= 1) {
        const recencyDiff = compareByReleaseYearDesc(b.item, a.item);
        if (recencyDiff !== 0) return recencyDiff;
      }
      return compareByLocalePreference(a.item, b.item);
    })
    .slice(0, FOR_YOU_CANDIDATE_POOL);
}

function finalizeScoredForYou(
  scored: ScoredForYouItem[],
  rankingMap: Map<number, { reason: string; score: number }>,
  seeds: Map<string, RecommendationSeed>,
  taste: Awaited<ReturnType<typeof loadTasteProfile>>,
  limit: number,
  filterIds: {
    hiddenIds: Awaited<ReturnType<typeof getHiddenIds>>;
    libraryIds: Awaited<ReturnType<typeof getLibraryIds>>;
    watchedIds: Awaited<ReturnType<typeof getWatchedIds>>;
    fullyWatchedIds: Awaited<ReturnType<typeof getFullyWatchedIds>>;
  },
  rtMap: Map<number, CandidateRtRatings> = new Map(),
  refreshCount = 0,
  trendingKeys: Set<string> = new Set(),
  popularKeys: Set<string> = new Set()
): RecommendationItem[] {
  const { hiddenIds, libraryIds, watchedIds, fullyWatchedIds } = filterIds;
  const heuristicRange = getHeuristicScoreRange(scored);

  const sorted = scored
    .map(({ item, score: heuristicScore }) => {
      const key = mediaItemKey(item);
      const rank = rankingMap.get(item.id);
      const personalScore =
        rank != null
          ? clampMatchPercent(rank.score)
          : toMatchPercent(heuristicScore, heuristicRange.min, heuristicRange.max);
      const qualityScore = qualityPercentForItem(item, rtMap);
      const matchScore = blendPersonalAndQuality(personalScore, qualityScore);
      return {
        ...item,
        score: matchScore,
        reason: buildRecommendationReason(seeds.get(key), taste, item.id),
        inLibrary: libraryIds.has(key),
        watched: watchedIds.has(key),
        fullyWatched: fullyWatchedIds.has(key),
        hidden: hiddenIds.has(key),
      };
    })
    .filter((item) => !item.hidden && passesHomeLocaleFilter(item))
    .sort((a, b) => sortForYouItemsByScoreAndRecency(a, b, refreshCount));

  return pickDiverseForYouRow(sorted, seeds, limit, refreshCount, trendingKeys, popularKeys);
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function scoreAndFinalizeForYou(
  candidates: TmdbMediaItem[],
  seeds: Map<string, RecommendationSeed>,
  taste: Awaited<ReturnType<typeof loadTasteProfile>>,
  mergedCriteria: SearchCriteria,
  usernames: string[],
  userId: string,
  limit: number,
  filterIds: {
    hiddenIds: Awaited<ReturnType<typeof getHiddenIds>>;
    libraryIds: Awaited<ReturnType<typeof getLibraryIds>>;
    watchedIds: Awaited<ReturnType<typeof getWatchedIds>>;
    fullyWatchedIds: Awaited<ReturnType<typeof getFullyWatchedIds>>;
  },
  refreshCount = 0,
  trendingKeys: Set<string> = new Set(),
  popularKeys: Set<string> = new Set()
): Promise<RecommendationItem[]> {
  const scored = scoreCandidatesForYou(
    candidates,
    seeds,
    taste,
    mergedCriteria,
    refreshCount,
    trendingKeys,
    popularKeys
  );
  const tasteSummary = generateTasteSummary(taste);
  const rerankPool = selectCandidatesForRerank(scored, seeds, FOR_YOU_RERANK_LIMIT);
  const topItems = rerankPool.map(({ item }) => item);
  const rtMap = await fetchCandidateRtRatings(topItems);

  let rankings: Array<{ id: number; reason: string; score: number }> = [];
  try {
    rankings = await rerankRecommendations(
      userId,
      buildRerankCandidates(rerankPool, rtMap, seeds),
      tasteSummary,
      mergedCriteria as Record<string, unknown>
    );
  } catch {
    const heuristicRange = getHeuristicScoreRange(scored);
    rankings = scored.map(({ item, score }) => ({
      id: item.id,
      reason: buildRecommendationReason(seeds.get(mediaItemKey(item)), taste, item.id),
      score: toMatchPercent(score, heuristicRange.min, heuristicRange.max),
    }));
  }

  const rankingMap = new Map(rankings.map((r) => [r.id, r]));
  return finalizeScoredForYou(
    scored,
    rankingMap,
    seeds,
    taste,
    limit,
    filterIds,
    rtMap,
    refreshCount,
    trendingKeys,
    popularKeys
  );
}

async function generateCandidates(
  criteria: SearchCriteria,
  userId: string,
  usernames: string[],
  prefetchedBrowse?: PrefetchedBrowse,
  seedOffset = 0,
  refreshCount = 0,
  excludeIds: Set<number> = new Set()
): Promise<{
  candidates: TmdbMediaItem[];
  seeds: Map<string, RecommendationSeed>;
  trendingKeys: Set<string>;
  popularKeys: Set<string>;
}> {
  const [hiddenIds, fullyWatchedIds, libraryIds] = await Promise.all([
    getHiddenIds(userId),
    getFullyWatchedIds(usernames),
    getLibraryIds(),
  ]);

  const filterOpts = { hiddenIds, fullyWatchedIds, libraryIds, criteria };
  const candidates: TmdbMediaItem[] = [];
  const seeds = new Map<string, RecommendationSeed>();
  const trendingKeys = new Set<string>();
  const popularKeys = new Set<string>();
  const seen = new Set<string>();

  const addItems = (
    items: TmdbMediaItem[],
    seed?: RecommendationSeed,
    source?: "trending" | "popular"
  ) => {
    for (const item of filterMediaItems(items, filterOpts)) {
      if (!isWithinForYouRecencyWindow(item, refreshCount)) continue;
      if (excludeIds.has(item.id)) continue;
      const key = mediaItemKey(item);
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push(item);
        if (source === "trending") trendingKeys.add(key);
        if (source === "popular") popularKeys.add(key);
        if (seed && !seeds.has(key)) {
          seeds.set(key, seed);
        }
      }
    }
  };

  const history = await db.select().from(watchHistoryCache);
  const userHistory = history.filter((h) => usernames.includes(h.tautulliUsername));

  const personal = await generatePersonalSeedCandidates(
    usernames,
    filterOpts,
    seedOffset,
    FOR_YOU_WATCH_SEED_LIMIT,
    true,
    userId
  );
  for (const item of personal.candidates) {
    addItems([item], personal.seeds.get(mediaItemKey(item)));
  }

  const hasPersonalData = personal.seeds.size > 0;

  const browseLimit = FOR_YOU_POPULAR_BROWSE_LIMIT;
  const [trending, popularMovies, popularTv] = prefetchedBrowse
    ? [
        { results: prefetchedBrowse.trending ?? [] },
        { results: prefetchedBrowse.popularMovies ?? [] },
        { results: prefetchedBrowse.popularTv ?? [] },
      ]
    : await Promise.all([getTrending("week"), getPopularMovies(), getPopularTv()]);

  addItems(trending.results.slice(0, browseLimit), undefined, "trending");
  addItems(popularMovies.results.slice(0, browseLimit), undefined, "popular");
  addItems(popularTv.results.slice(0, browseLimit), undefined, "popular");

  const mediaType = criteria.mediaType ?? "all";
  const shouldDiscover = !hasPersonalData || hasActiveChatCriteria(criteria);

  if (shouldDiscover) {
    const discoverPromises: Promise<{ results: TmdbMediaItem[] }>[] = [];

    if (mediaType !== "tv") {
      discoverPromises.push(discoverMovies(buildDiscoverFilters(criteria, "movie")));
    }
    if (mediaType !== "movie") {
      discoverPromises.push(discoverTv(buildDiscoverFilters(criteria, "tv")));
    }

    const discoverResults = await Promise.all(discoverPromises);
    for (const result of discoverResults) {
      addItems(result.results);
    }

    if (!hasPersonalData) {
      const localeDiscoverPromises: Promise<{ results: TmdbMediaItem[] }>[] = [];
      if (mediaType !== "tv") {
        localeDiscoverPromises.push(
          discoverMovies(
            withUsUkEnglishDiscoverFilters(buildDiscoverFilters(criteria, "movie"))
          )
        );
      }
      if (mediaType !== "movie") {
        localeDiscoverPromises.push(
          discoverTv(withUsUkEnglishDiscoverFilters(buildDiscoverFilters(criteria, "tv")))
        );
      }

      const localeDiscoverResults = await Promise.all(localeDiscoverPromises);
      for (const result of localeDiscoverResults) {
        addItems(result.results);
      }
    }
  }

  const qualityDiscoverPromises: Promise<{ results: TmdbMediaItem[] }>[] = [];
  if (mediaType !== "tv") {
    qualityDiscoverPromises.push(
      discoverMovies(buildQualityDiscoverFilters(criteria, "movie"))
    );
  }
  if (mediaType !== "movie") {
    qualityDiscoverPromises.push(discoverTv(buildQualityDiscoverFilters(criteria, "tv")));
  }
  const qualityDiscoverResults = await Promise.all(qualityDiscoverPromises);
  for (const result of qualityDiscoverResults) {
    addItems(result.results);
  }

  if (criteria.moreLike) {
    try {
      const [similar, recs] = await Promise.all([
        getSimilar(criteria.moreLike.mediaType, criteria.moreLike.tmdbId),
        getRecommendations(criteria.moreLike.mediaType, criteria.moreLike.tmdbId),
      ]);
      const seed: RecommendationSeed = { kind: "similar", title: criteria.moreLike.title };
      addItems(similar.results, seed);
      addItems(recs.results, seed);
    } catch {
      // skip if TMDB fails for moreLike seed
    }
  }

  return { candidates, seeds, trendingKeys, popularKeys };
}

function storeForYouMemoryCache(cacheKey: string, items: RecommendationItem[]) {
  forYouCache.set(cacheKey, {
    data: items,
    expiresAt: Date.now() + FOR_YOU_CACHE_TTL_MS,
  });
}

async function storeForYouCaches(
  userId: string,
  cacheKey: string,
  items: RecommendationItem[]
) {
  storeForYouMemoryCache(cacheKey, items);
  await setForYouDbCache(userId, cacheKey, { items }, FOR_YOU_DB_CACHE_TTL_MS);
}

/**
 * Return cached For You items only if they still match the current hide list.
 * Otherwise invalidate and return null so the caller recomputes.
 */
async function readForYouCacheIfFresh(
  userId: string,
  cacheKey: string
): Promise<RecommendationItem[] | null> {
  const memoryCached = forYouCache.get(cacheKey);
  let items: RecommendationItem[] | null = null;

  if (memoryCached && Date.now() < memoryCached.expiresAt) {
    items = memoryCached.data;
  } else {
    const dbCached = await getForYouDbCache(userId, cacheKey);
    if (dbCached && Date.now() < dbCached.expiresAt) {
      items = dbCached.payload.items;
      storeForYouMemoryCache(cacheKey, items);
    }
  }

  if (!items) return null;

  const hiddenIds = await getHiddenIds(userId);
  const filtered = items.filter((item) => !hiddenIds.has(mediaItemKey(item)));
  if (filtered.length !== items.length) {
    forYouCache.delete(cacheKey);
    await deleteForYouDbCacheEntry(userId, cacheKey);
    return null;
  }

  return filtered;
}

type PersonalizeBrowseContext = {
  scored: ScoredForYouItem[];
  taste: Awaited<ReturnType<typeof loadTasteProfile>>;
  hiddenIds: Awaited<ReturnType<typeof getHiddenIds>>;
  watchedIds: Awaited<ReturnType<typeof getWatchedIds>>;
  fullyWatchedIds: Awaited<ReturnType<typeof getFullyWatchedIds>>;
  libraryIds: Awaited<ReturnType<typeof getLibraryIds>>;
  rerankPool: ScoredForYouItem[];
  rtMap: Map<number, CandidateRtRatings>;
  heuristicRange: { min: number; max: number };
};

async function preparePersonalizeBrowseContext(
  userId: string,
  items: TmdbMediaItem[],
  options: { fetchRt?: boolean } = {}
): Promise<PersonalizeBrowseContext | null> {
  if (items.length === 0) return null;

  const fetchRt = options.fetchRt !== false;
  const { taste, hiddenIds, watchedIds, fullyWatchedIds, libraryIds } =
    await loadPersonalizeFilters(userId);

  const tasteInput = {
    genres: taste.genres,
    decades: taste.decades,
    avgRating: taste.avgRating,
  };

  const scored: ScoredForYouItem[] = items
    .map((item) => ({
      item,
      score: scoreItem(item, tasteInput, {}) + popularityHeuristicBoost(item),
    }))
    .sort((a, b) => b.score - a.score);

  const rerankPool = scored.slice(0, FOR_YOU_RERANK_LIMIT);
  const topItems = rerankPool.map(({ item }) => item);
  const rtMap = fetchRt
    ? await fetchCandidateRtRatings(topItems)
    : new Map<number, CandidateRtRatings>();

  return {
    scored,
    taste,
    hiddenIds,
    watchedIds,
    fullyWatchedIds,
    libraryIds,
    rerankPool,
    rtMap,
    heuristicRange: getHeuristicScoreRange(scored),
  };
}

function finalizePersonalizedBrowse(
  ctx: PersonalizeBrowseContext,
  rankingMap: Map<number, { reason: string; score: number }>
): RecommendationItem[] {
  const { scored, taste, hiddenIds, watchedIds, fullyWatchedIds, libraryIds, rtMap, heuristicRange } =
    ctx;

  return scored
    .map(({ item, score: heuristicScore }) => {
      const key = mediaItemKey(item);
      const rank = rankingMap.get(item.id);
      const personalScore =
        rank != null
          ? clampMatchPercent(rank.score)
          : toMatchPercent(heuristicScore, heuristicRange.min, heuristicRange.max);
      const qualityScore = qualityPercentForItem(item, rtMap);
      const matchScore = blendPersonalAndQuality(personalScore, qualityScore);
      return {
        ...item,
        score: matchScore,
        reason: rank?.reason ?? buildRecommendationReason(undefined, taste, item.id),
        inLibrary: libraryIds.has(key),
        watched: watchedIds.has(key),
        fullyWatched: fullyWatchedIds.has(key),
        hidden: hiddenIds.has(key),
      };
    })
    .filter((item) => !item.hidden)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

export type PersonalizeBrowseStreamEvent = {
  items: RecommendationItem[];
  done: boolean;
  progress?: { ranked: number; total: number };
};

/**
 * Re-score and AI-rerank an existing browse/discover list for the signed-in user.
 * Returns the full input set sorted by taste (not the For You diversity-capped row).
 */
export async function personalizeBrowseItems(
  userId: string,
  items: TmdbMediaItem[]
): Promise<RecommendationItem[]> {
  const ctx = await preparePersonalizeBrowseContext(userId, items);
  if (!ctx) return [];

  const tasteSummary = generateTasteSummary(ctx.taste);
  const emptySeeds = new Map<string, RecommendationSeed>();
  const rankingMap = new Map<number, { reason: string; score: number }>();

  try {
    const rankings = await rerankRecommendations(
      userId,
      buildRerankCandidates(ctx.rerankPool, ctx.rtMap, emptySeeds),
      tasteSummary,
      {}
    );
    for (const ranking of rankings) {
      rankingMap.set(ranking.id, {
        reason: ranking.reason,
        score: clampMatchPercent(ranking.score),
      });
    }
  } catch {
    for (const { item, score } of ctx.scored) {
      rankingMap.set(item.id, {
        reason: buildRecommendationReason(undefined, ctx.taste, item.id),
        score: toMatchPercent(score, ctx.heuristicRange.min, ctx.heuristicRange.max),
      });
    }
  }

  return finalizePersonalizedBrowse(ctx, rankingMap);
}

/**
 * Stream personalized browse results: first AI chunk ASAP, then roll remaining chunks.
 */
export async function streamPersonalizeBrowseItems(
  userId: string,
  items: TmdbMediaItem[],
  emit: (event: PersonalizeBrowseStreamEvent) => void
): Promise<void> {
  const resultKey = personalizeResultCacheKey(userId, items);
  const cachedResult = personalizeResultCache.get(resultKey);
  if (cachedResult && Date.now() < cachedResult.expiresAt) {
    emit({ items: cachedResult.items, done: true, progress: { ranked: 0, total: 0 } });
    return;
  }

  const ctx = await preparePersonalizeBrowseContext(userId, items, { fetchRt: false });
  if (!ctx) {
    emit({ items: [], done: true });
    return;
  }

  const rankingMap = new Map<number, { reason: string; score: number }>();
  const rerankTotal = ctx.rerankPool.length;
  const isHomeRow = items.length <= HOME_ROW_LIMIT;
  const tasteSummary = generateTasteSummary(ctx.taste);
  const emptySeeds = new Map<string, RecommendationSeed>();

  const rerankChunk = async (chunk: ScoredForYouItem[]) => {
    try {
      return await rerankRecommendations(
        userId,
        buildRerankCandidates(chunk, ctx.rtMap, emptySeeds),
        tasteSummary,
        {}
      );
    } catch {
      return chunk.map(({ item, score }) => ({
        id: item.id,
        reason: buildRecommendationReason(undefined, ctx.taste, item.id),
        score: toMatchPercent(score, ctx.heuristicRange.min, ctx.heuristicRange.max),
      }));
    }
  };

  const emitHeuristic = () => {
    emit({
      items: finalizePersonalizedBrowse(ctx, rankingMap),
      done: false,
      progress: { ranked: 0, total: rerankTotal },
    });
  };

  emitHeuristic();

  if (isHomeRow) {
    const aiPool = ctx.rerankPool.slice(0, HOME_BROWSE_RERANK_LIMIT);
    if (aiPool.length > 0) {
      const rankings = await rerankChunk(aiPool);
      for (const ranking of rankings) {
        rankingMap.set(ranking.id, {
          reason: ranking.reason,
          score: clampMatchPercent(ranking.score),
        });
      }
    }

    const finalItems = finalizePersonalizedBrowse(ctx, rankingMap);
    personalizeResultCache.set(resultKey, {
      expiresAt: Date.now() + PERSONALIZE_CACHE_TTL_MS,
      items: finalItems,
    });
    emit({ items: finalItems, done: true, progress: { ranked: aiPool.length, total: rerankTotal } });
    return;
  }

  const chunks = chunkArray(ctx.rerankPool, FOR_YOU_RERANK_CHUNK_SIZE);
  const topItems = ctx.rerankPool.map(({ item }) => item);
  let rankedCount = 0;
  const firstChunk = chunks[0];

  if (firstChunk?.length) {
    const firstRt = await fetchCandidateRtRatings(firstChunk.map(({ item }) => item));
    for (const [id, ratings] of firstRt) {
      ctx.rtMap.set(id, ratings);
    }

    const remainingTopItems = topItems.slice(firstChunk.length);
    const remainingRtPromise =
      remainingTopItems.length > 0
        ? fetchCandidateRtRatings(remainingTopItems)
        : Promise.resolve(new Map<number, CandidateRtRatings>());

    const firstRankings = await rerankChunk(firstChunk);
    for (const ranking of firstRankings) {
      rankingMap.set(ranking.id, {
        reason: ranking.reason,
        score: clampMatchPercent(ranking.score),
      });
    }
    rankedCount += firstChunk.length;

    emit({
      items: finalizePersonalizedBrowse(ctx, rankingMap),
      done: false,
      progress: { ranked: rankedCount, total: rerankTotal },
    });

    const remainingRt = await remainingRtPromise;
    for (const [id, ratings] of remainingRt) {
      ctx.rtMap.set(id, ratings);
    }

    const remainingChunks = chunks.slice(1);
    for (let i = 0; i < remainingChunks.length; i += PERSONALIZE_RERANK_PARALLEL) {
      const batch = remainingChunks.slice(i, i + PERSONALIZE_RERANK_PARALLEL);
      const batchResults = await Promise.all(batch.map((chunk) => rerankChunk(chunk)));

      for (let j = 0; j < batch.length; j++) {
        for (const ranking of batchResults[j] ?? []) {
          rankingMap.set(ranking.id, {
            reason: ranking.reason,
            score: clampMatchPercent(ranking.score),
          });
        }
        rankedCount += batch[j]?.length ?? 0;
      }

      emit({
        items: finalizePersonalizedBrowse(ctx, rankingMap),
        done: false,
        progress: { ranked: rankedCount, total: rerankTotal },
      });
    }
  }

  const finalItems = finalizePersonalizedBrowse(ctx, rankingMap);
  personalizeResultCache.set(resultKey, {
    expiresAt: Date.now() + PERSONALIZE_CACHE_TTL_MS,
    items: finalItems,
  });

  emit({
    items: finalItems,
    done: true,
    progress: { ranked: rerankTotal, total: rerankTotal },
  });
}

export async function getForYouRecommendations(
  userId: string,
  criteria: SearchCriteria = {},
  options: {
    limit?: number;
    prefetchedBrowse?: PrefetchedBrowse;
    refresh?: boolean;
    seedOffset?: number;
    refreshCount?: number;
    refreshGeneration?: number;
  } = {}
): Promise<RecommendationItem[]> {
  const limit = options.limit ?? HOME_ROW_LIMIT;
  const refreshCount = Math.max(0, options.refreshCount ?? 0);
  const refreshGeneration = Math.max(0, options.refreshGeneration ?? 0);
  const cacheKey = forYouCacheKey(
    userId,
    criteria,
    limit,
    options.prefetchedBrowse,
    refreshCount,
    refreshGeneration
  );

  if (options.refresh) {
    forYouCache.delete(cacheKey);
    await deleteForYouDbCacheEntry(userId, cacheKey);
  } else {
    const cached = await readForYouCacheIfFresh(userId, cacheKey);
    if (cached) {
      rememberForYouRow(userId, cached);
      return cached;
    }
  }

  const [prefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  const usernames = prefs?.tautulliUsernames ?? [];
  const excludeIds = getForYouExcludeIds(userId, options.refresh === true);
  const seedOffset = await resolveForYouSeedOffset(
    usernames,
    options.seedOffset,
    options.refresh ? refreshGeneration : 0
  );

  const items = await computeForYouRecommendations(
    userId,
    criteria,
    options,
    limit,
    seedOffset,
    refreshCount,
    excludeIds
  );
  await storeForYouCaches(userId, cacheKey, items);
  rememberForYouRow(userId, items);
  return items;
}

async function computeForYouRecommendations(
  userId: string,
  criteria: SearchCriteria,
  options: {
    limit?: number;
    prefetchedBrowse?: PrefetchedBrowse;
    refresh?: boolean;
    refreshGeneration?: number;
  },
  limit: number,
  seedOffset: number,
  refreshCount = 0,
  excludeIds: Set<number> = new Set()
): Promise<RecommendationItem[]> {
  const [prefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  const usernames = prefs?.tautulliUsernames ?? [];
  const mergedCriteria = applyForYouRecencyToCriteria(
    await buildMergedForYouCriteria(prefs, criteria),
    refreshCount
  );

  const [taste, hiddenIds, watchedIds, fullyWatchedIds, libraryIds] = await Promise.all([
    loadTasteProfile(userId),
    getHiddenIds(userId),
    getWatchedIds(usernames),
    getFullyWatchedIds(usernames),
    getLibraryIds(),
  ]);

  const { candidates, seeds, trendingKeys, popularKeys } = await generateCandidates(
    mergedCriteria,
    userId,
    usernames,
    options.prefetchedBrowse,
    seedOffset,
    refreshCount,
    excludeIds
  );

  return scoreAndFinalizeForYou(
    candidates,
    seeds,
    taste,
    mergedCriteria,
    usernames,
    userId,
    limit,
    { hiddenIds, libraryIds, watchedIds, fullyWatchedIds },
    refreshCount,
    trendingKeys,
    popularKeys
  );
}

export type ForYouStreamEvent = {
  items: RecommendationItem[];
  done: boolean;
};

async function prepareForYouStreamContext(
  userId: string,
  criteria: SearchCriteria,
  options: {
    limit?: number;
    prefetchedBrowse?: PrefetchedBrowse;
    refresh?: boolean;
    seedOffset?: number;
    refreshCount?: number;
    refreshGeneration?: number;
  }
): Promise<
  | { cached: RecommendationItem[] }
  | {
      scored: ScoredForYouItem[];
      seeds: Map<string, RecommendationSeed>;
      taste: Awaited<ReturnType<typeof loadTasteProfile>>;
      mergedCriteria: SearchCriteria;
      filterIds: {
        hiddenIds: Awaited<ReturnType<typeof getHiddenIds>>;
        libraryIds: Awaited<ReturnType<typeof getLibraryIds>>;
        watchedIds: Awaited<ReturnType<typeof getWatchedIds>>;
        fullyWatchedIds: Awaited<ReturnType<typeof getFullyWatchedIds>>;
      };
      limit: number;
      cacheKey: string;
      refreshCount: number;
      trendingKeys: Set<string>;
      popularKeys: Set<string>;
    }
> {
  const limit = options.limit ?? HOME_ROW_LIMIT;
  const refreshCount = Math.max(0, options.refreshCount ?? 0);
  const refreshGeneration = Math.max(0, options.refreshGeneration ?? 0);
  const cacheKey = forYouCacheKey(
    userId,
    criteria,
    limit,
    options.prefetchedBrowse,
    refreshCount,
    refreshGeneration
  );

  if (options.refresh) {
    forYouCache.delete(cacheKey);
    await deleteForYouDbCacheEntry(userId, cacheKey);
  } else {
    const cached = await readForYouCacheIfFresh(userId, cacheKey);
    if (cached) {
      rememberForYouRow(userId, cached);
      return { cached };
    }
  }

  const [prefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  const usernames = prefs?.tautulliUsernames ?? [];
  const mergedCriteria = applyForYouRecencyToCriteria(
    await buildMergedForYouCriteria(prefs, criteria),
    refreshCount
  );

  const [taste, hiddenIds, watchedIds, fullyWatchedIds, libraryIds] = await Promise.all([
    loadTasteProfile(userId),
    getHiddenIds(userId),
    getWatchedIds(usernames),
    getFullyWatchedIds(usernames),
    getLibraryIds(),
  ]);

  const filterIds = { hiddenIds, libraryIds, watchedIds, fullyWatchedIds };
  const excludeIds = getForYouExcludeIds(userId, options.refresh === true);
  const seedOffset = await resolveForYouSeedOffset(
    usernames,
    options.seedOffset,
    options.refresh ? refreshGeneration : 0
  );

  const { candidates, seeds, trendingKeys, popularKeys } = await generateCandidates(
    mergedCriteria,
    userId,
    usernames,
    options.prefetchedBrowse,
    seedOffset,
    refreshCount,
    excludeIds
  );

  return {
    scored: scoreCandidatesForYou(
      candidates,
      seeds,
      taste,
      mergedCriteria,
      refreshCount,
      trendingKeys,
      popularKeys
    ),
    seeds,
    taste,
    mergedCriteria,
    filterIds,
    limit,
    cacheKey,
    refreshCount,
    trendingKeys,
    popularKeys,
  };
}

export async function streamForYouRecommendations(
  userId: string,
  options: {
    refresh?: boolean;
    limit?: number;
    refreshCount?: number;
    refreshGeneration?: number;
  } = {},
  emit: (event: ForYouStreamEvent) => void
): Promise<void> {
  const prepared = await prepareForYouStreamContext(userId, {}, options);

  if ("cached" in prepared) {
    emit({ items: prepared.cached, done: true });
    return;
  }

  const {
    scored,
    seeds,
    taste,
    mergedCriteria,
    filterIds,
    limit,
    cacheKey,
    refreshCount,
    trendingKeys,
    popularKeys,
  } = prepared;
  const rankingMap = new Map<number, { reason: string; score: number }>();
  const tasteSummary = generateTasteSummary(taste);
  const heuristicRange = getHeuristicScoreRange(scored);
  const rerankPool = selectCandidatesForRerank(scored, seeds, FOR_YOU_RERANK_LIMIT);
  const topItems = rerankPool.map(({ item }) => item);
  const rtMap = await fetchCandidateRtRatings(topItems);

  emit({
    items: finalizeScoredForYou(
      scored,
      rankingMap,
      seeds,
      taste,
      limit,
      filterIds,
      rtMap,
      refreshCount,
      trendingKeys,
      popularKeys
    ),
    done: false,
  });

  const chunks = chunkArray(rerankPool, FOR_YOU_RERANK_CHUNK_SIZE);

  const rerankChunk = async (chunk: ScoredForYouItem[]) => {
    try {
      return await rerankRecommendations(
        userId,
        buildRerankCandidates(chunk, rtMap, seeds),
        tasteSummary,
        mergedCriteria as Record<string, unknown>
      );
    } catch {
      return chunk.map(({ item, score }) => ({
        id: item.id,
        reason: buildRecommendationReason(seeds.get(mediaItemKey(item)), taste, item.id),
        score: toMatchPercent(score, heuristicRange.min, heuristicRange.max),
      }));
    }
  };

  for (const chunk of chunks) {
    const rankings = await rerankChunk(chunk);
    for (const ranking of rankings) {
      rankingMap.set(ranking.id, {
        reason: ranking.reason,
        score: clampMatchPercent(ranking.score),
      });
    }
    emit({
      items: finalizeScoredForYou(
        scored,
        rankingMap,
        seeds,
        taste,
        limit,
        filterIds,
        rtMap,
        refreshCount,
        trendingKeys,
        popularKeys
      ),
      done: false,
    });
  }

  const finalItems = finalizeScoredForYou(
    scored,
    rankingMap,
    seeds,
    taste,
    limit,
    filterIds,
    rtMap,
    refreshCount,
    trendingKeys,
    popularKeys
  );
  await storeForYouCaches(userId, cacheKey, finalItems);
  rememberForYouRow(userId, finalItems);
  emit({ items: finalItems, done: true });
}

export type WatchSeed = {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
};

const BECAUSE_YOU_WATCHED_SEED_LIMIT = 20;

type WatchHistoryEntry = {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  watchedAt: Date | null;
};

async function getUserWatchHistoryEntries(userId: string): Promise<WatchHistoryEntry[]> {
  const [prefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  const usernames = prefs?.tautulliUsernames ?? [];
  if (usernames.length === 0) return [];

  const history = await db.select().from(watchHistoryCache);
  return history
    .filter((h) => usernames.includes(h.tautulliUsername))
    .map((h) => ({
      tmdbId: h.tmdbId,
      mediaType: h.mediaType,
      title: h.title?.trim() ?? "",
      watchedAt: h.watchedAt,
    }));
}

function dedupeAndSortWatchEntries(entries: WatchHistoryEntry[]): WatchHistoryEntry[] {
  const seen = new Set<string>();
  const unique: WatchHistoryEntry[] = [];

  for (const entry of [...entries].sort(
    (a, b) => (b.watchedAt?.getTime() ?? 0) - (a.watchedAt?.getTime() ?? 0)
  )) {
    const key = `${entry.mediaType}:${entry.tmdbId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }

  return unique;
}

function interleaveMovieAndTvSeeds(
  entries: WatchHistoryEntry[],
  limit: number
): WatchHistoryEntry[] {
  const movies = entries.filter((entry) => entry.mediaType === "movie");
  const tv = entries.filter((entry) => entry.mediaType === "tv");
  const result: WatchHistoryEntry[] = [];
  let movieIndex = 0;
  let tvIndex = 0;

  while (result.length < limit && (movieIndex < movies.length || tvIndex < tv.length)) {
    if (movieIndex < movies.length) result.push(movies[movieIndex++]);
    if (result.length >= limit) break;
    if (tvIndex < tv.length) result.push(tv[tvIndex++]);
  }

  while (result.length < limit && movieIndex < movies.length) {
    result.push(movies[movieIndex++]);
  }
  while (result.length < limit && tvIndex < tv.length) {
    result.push(tv[tvIndex++]);
  }

  return result.slice(0, limit);
}

async function resolveWatchSeedTitle(
  entry: WatchHistoryEntry,
  titleCache: Map<string, string>
): Promise<string | null> {
  if (entry.title) return entry.title;

  const key = `${entry.mediaType}:${entry.tmdbId}`;
  const cached = titleCache.get(key);
  if (cached) return cached;

  const brief = await getMediaItemBrief(entry.mediaType, entry.tmdbId);
  const title = brief ? getMediaTitle(brief).trim() : "";
  if (title) titleCache.set(key, title);
  return title || null;
}

async function entriesToWatchSeeds(
  entries: WatchHistoryEntry[],
  titleCache = new Map<string, string>()
): Promise<WatchSeed[]> {
  const seeds = await Promise.all(
    entries.map(async (entry) => {
      const title = await resolveWatchSeedTitle(entry, titleCache);
      if (!title) return null;
      return { tmdbId: entry.tmdbId, mediaType: entry.mediaType, title };
    })
  );

  return seeds.filter((seed): seed is WatchSeed => seed != null);
}

export async function getRecentWatchSeeds(userId: string): Promise<WatchSeed[]> {
  const entries = dedupeAndSortWatchEntries(await getUserWatchHistoryEntries(userId));
  const balanced = interleaveMovieAndTvSeeds(entries, BECAUSE_YOU_WATCHED_SEED_LIMIT);
  return entriesToWatchSeeds(balanced);
}

export async function searchWatchHistory(
  userId: string,
  query: string,
  limit = 25
): Promise<WatchSeed[]> {
  const q = query.trim().toLowerCase();
  const entries = dedupeAndSortWatchEntries(await getUserWatchHistoryEntries(userId));
  const titleCache = new Map<string, string>();
  const results: WatchSeed[] = [];

  for (const entry of entries) {
    const title = await resolveWatchSeedTitle(entry, titleCache);
    if (!title) continue;
    if (q && !title.toLowerCase().includes(q)) continue;
    results.push({ tmdbId: entry.tmdbId, mediaType: entry.mediaType, title });
    if (results.length >= limit) break;
  }

  return results;
}

export async function getBecauseYouWatched(
  userId: string,
  options: {
    seedIndex?: number;
    seedTmdbId?: number;
    seedMediaType?: MediaType;
    limit?: number;
  } = {}
): Promise<{
  seedTitle: string;
  seedIndex: number;
  seedCount: number;
  items: RecommendationItem[];
} | null> {
  const limit = options.limit ?? HOME_ROW_LIMIT;
  const seeds = await getRecentWatchSeeds(userId);

  const [prefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  const usernames = prefs?.tautulliUsernames ?? [];

  let seed: WatchSeed;
  let seedIndex: number;

  if (options.seedTmdbId != null && options.seedMediaType) {
    const history = await db.select().from(watchHistoryCache);
    const entry = history.find(
      (h) =>
        usernames.includes(h.tautulliUsername) &&
        h.tmdbId === options.seedTmdbId &&
        h.mediaType === options.seedMediaType
    );
    if (!entry) return null;

    const resolvedTitle = await resolveWatchSeedTitle(
      {
        tmdbId: entry.tmdbId,
        mediaType: entry.mediaType,
        title: entry.title?.trim() ?? "",
        watchedAt: entry.watchedAt,
      },
      new Map()
    );
    if (!resolvedTitle) return null;

    seed = {
      tmdbId: entry.tmdbId,
      mediaType: entry.mediaType,
      title: resolvedTitle,
    };
    const matchedIndex = seeds.findIndex(
      (s) => s.tmdbId === seed.tmdbId && s.mediaType === seed.mediaType
    );
    seedIndex = matchedIndex >= 0 ? matchedIndex : 0;
  } else {
    if (seeds.length === 0) return null;

    seedIndex =
      options.seedIndex != null
        ? ((options.seedIndex % seeds.length) + seeds.length) % seeds.length
        : Math.floor(Math.random() * seeds.length);

    seed = seeds[seedIndex];
  }

  const [similar, recs] = await Promise.all([
    getSimilar(seed.mediaType, seed.tmdbId),
    getRecommendations(seed.mediaType, seed.tmdbId),
  ]);

  const [hiddenIds, statusSets] = await Promise.all([
    getHiddenIds(userId),
    getStatusIdSets(userId, usernames),
  ]);
  const seen = new Set<string>();
  const rawItems = prioritizeHomeLocaleItems(
    [...similar.results, ...recs.results].filter((item) => {
      const key = mediaItemKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return !hiddenIds.has(key) && key !== `${seed.mediaType}:${seed.tmdbId}`;
    }),
    limit
  );

  const items = enrichItemsWithStatus(rawItems, statusSets);

  return {
    seedTitle: seed.title,
    seedIndex,
    seedCount: seeds.length,
    items: items.map((item) => ({ ...item, reason: undefined })),
  };
}
