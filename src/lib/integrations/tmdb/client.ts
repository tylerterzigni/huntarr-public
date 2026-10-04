import { getTmdbApiKey, getTmdbLanguage, getTmdbRegion } from "@/lib/settings/global";
import { mergeKeywordIds, resolveGenreFilters } from "@/lib/discover/genres";
import type { MediaType, TmdbMediaItem, TmdbPersonSearchResult } from "@/types";

const TMDB_BASE = "https://api.themoviedb.org/3";

async function tmdbFetch<T>(
  path: string,
  params: Record<string, string> = {},
  options: { cache?: RequestCache } = {}
): Promise<T> {
  const apiKey = await getTmdbApiKey();
  if (!apiKey) throw new Error("TMDB API key not configured");

  const language = await getTmdbLanguage();
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", language);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(
    url.toString(),
    options.cache === "no-store" ? { cache: "no-store" } : { next: { revalidate: 3600 } }
  );
  if (!res.ok) {
    throw new Error(`TMDB error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function getPopularMovies(page = 1) {
  return tmdbFetch<{ results: TmdbMediaItem[] }>(`/movie/popular`, { page: String(page) });
}

export async function getPopularTv(page = 1) {
  return tmdbFetch<{ results: TmdbMediaItem[] }>(`/tv/popular`, { page: String(page) });
}

/** Local calendar date as YYYY-MM-DD (Seerr/Overseerr upcoming rows). */
function todayIsoDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60 * 1000).toISOString().split("T")[0]!;
}

export async function getUpcomingMovies(page = 1) {
  const region = await getTmdbRegion();
  return tmdbFetch<{ results: TmdbMediaItem[] }>(`/discover/movie`, {
    region,
    sort_by: "popularity.desc",
    "primary_release_date.gte": todayIsoDate(),
    page: String(page),
  });
}

export async function getUpcomingTv(page = 1) {
  return tmdbFetch<{ results: TmdbMediaItem[] }>(`/discover/tv`, {
    sort_by: "popularity.desc",
    "first_air_date.gte": todayIsoDate(),
    page: String(page),
  });
}

export async function getTrending(timeWindow: "day" | "week" = "week", page = 1) {
  return tmdbFetch<{ results: TmdbMediaItem[] }>(`/trending/all/${timeWindow}`, {
    page: String(page),
  });
}

export async function searchMulti(query: string, page = 1) {
  return tmdbFetch<{ results: TmdbMediaItem[]; total_pages: number }>(`/search/multi`, {
    query,
    page: String(page),
    include_adult: "false",
  });
}

export async function searchTv(query: string, page = 1) {
  return tmdbFetch<{ results: TmdbMediaItem[]; total_pages: number }>(`/search/tv`, {
    query,
    page: String(page),
    include_adult: "false",
  });
}

export async function searchMovie(query: string, page = 1) {
  return tmdbFetch<{ results: TmdbMediaItem[]; total_pages: number }>(`/search/movie`, {
    query,
    page: String(page),
    include_adult: "false",
  });
}

export async function findByImdbId(imdbId: string) {
  return tmdbFetch<{ tv_results: TmdbMediaItem[]; movie_results: TmdbMediaItem[] }>(
    `/find/${imdbId}`,
    { external_source: "imdb_id" }
  );
}

export async function getMediaItemBrief(
  mediaType: MediaType,
  id: number
): Promise<TmdbMediaItem | null> {
  try {
    const data = await tmdbFetch<Record<string, unknown>>(`/${mediaType}/${id}`);
    let runtime: number | undefined;
    if (mediaType === "movie" && typeof data.runtime === "number" && data.runtime > 0) {
      runtime = data.runtime;
    } else if (mediaType === "tv" && Array.isArray(data.episode_run_time)) {
      const nums = data.episode_run_time.filter(
        (n): n is number => typeof n === "number" && n > 0
      );
      if (nums.length > 0) {
        runtime = Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
      }
    }

    return {
      id,
      media_type: mediaType,
      title: mediaType === "movie" ? (data.title as string) : undefined,
      name: mediaType === "tv" ? (data.name as string) : undefined,
      poster_path: (data.poster_path as string | null) ?? null,
      overview: data.overview as string | undefined,
      vote_average: data.vote_average as number | undefined,
      vote_count: data.vote_count as number | undefined,
      popularity: data.popularity as number | undefined,
      original_language: data.original_language as string | undefined,
      origin_country: (data.origin_country as string[] | undefined) ?? [],
      genre_ids: ((data.genres as Array<{ id: number }> | undefined) ?? []).map(
        (genre) => genre.id
      ),
      release_date: mediaType === "movie" ? (data.release_date as string) : undefined,
      first_air_date: mediaType === "tv" ? (data.first_air_date as string) : undefined,
      runtime,
    };
  } catch {
    return null;
  }
}

export async function getMovieDetails(id: number) {
  const region = await getTmdbRegion();
  return tmdbFetch<Record<string, unknown>>(`/movie/${id}`, {
    append_to_response:
      "credits,watch/providers,similar,recommendations,videos,external_ids,keywords",
    watch_region: region,
  });
}

export async function getTvDetails(id: number) {
  const region = await getTmdbRegion();
  return tmdbFetch<Record<string, unknown>>(`/tv/${id}`, {
    append_to_response: "credits,watch/providers,similar,recommendations,keywords,videos,external_ids",
    watch_region: region,
  });
}

export interface TmdbReleaseDates {
  results?: Array<{
    iso_3166_1: string;
    release_dates: Array<{ release_date: string; type: number }>;
  }>;
}

export async function getMovieReleaseDates(id: number) {
  return tmdbFetch<TmdbReleaseDates>(`/movie/${id}/release_dates`);
}

export async function getTvAirInfo(id: number) {
  return tmdbFetch<{
    last_episode_to_air?: TmdbEpisodeAir | null;
    next_episode_to_air?: TmdbEpisodeAir | null;
  }>(`/tv/${id}`);
}

export interface TmdbEpisodeAir {
  air_date?: string | null;
  season_number: number;
  episode_number: number;
}

export async function getTvSeason(tvId: number, seasonNumber: number) {
  return tmdbFetch<Record<string, unknown>>(`/tv/${tvId}/season/${seasonNumber}`);
}

export async function searchPerson(query: string, page = 1) {
  return tmdbFetch<{
    results: TmdbPersonSearchResult[];
    total_pages: number;
  }>(`/search/person`, {
    query,
    page: String(page),
    include_adult: "false",
  });
}

export async function getPersonDetails(id: number) {
  return tmdbFetch<Record<string, unknown>>(`/person/${id}`, {
    append_to_response: "combined_credits,tv_credits",
  });
}

export async function getSimilar(mediaType: MediaType, id: number, page = 1) {
  return tmdbFetch<{ results: TmdbMediaItem[]; total_pages: number }>(
    `/${mediaType}/${id}/similar`,
    { page: String(page) }
  );
}

export async function getRecommendations(mediaType: MediaType, id: number, page = 1) {
  return tmdbFetch<{ results: TmdbMediaItem[]; total_pages: number }>(
    `/${mediaType}/${id}/recommendations`,
    { page: String(page) }
  );
}

export async function getCollection(id: number) {
  return tmdbFetch<{ parts: TmdbMediaItem[] }>(`/collection/${id}`);
}

export async function discoverMovies(filters: Record<string, string> = {}) {
  const region = await getTmdbRegion();
  return tmdbFetch<{ results: TmdbMediaItem[]; total_pages: number }>(
    `/discover/movie`,
    {
      region,
      sort_by: "popularity.desc",
      ...filters,
    },
    { cache: "no-store" }
  );
}

export async function discoverTv(filters: Record<string, string> = {}) {
  return tmdbFetch<{ results: TmdbMediaItem[]; total_pages: number }>(
    `/discover/tv`,
    {
      sort_by: "popularity.desc",
      ...filters,
    },
    { cache: "no-store" }
  );
}

const DISCOVER_PAGE_COUNT = 5;
const TMDB_PAGE_SIZE = 20;

function mergeTmdbPages(pages: Array<{ results: TmdbMediaItem[] }>): TmdbMediaItem[] {
  const seen = new Set<number>();
  const merged: TmdbMediaItem[] = [];
  for (const page of pages) {
    for (const item of page.results) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }
  }
  return merged;
}

function pagesForItemCount(itemCount: number): number {
  return Math.max(1, Math.ceil(itemCount / TMDB_PAGE_SIZE));
}

export async function getTrendingItems(
  timeWindow: "day" | "week" = "week",
  itemCount = TMDB_PAGE_SIZE
) {
  const pageCount = pagesForItemCount(itemCount);
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) => getTrending(timeWindow, i + 1))
  );
  return mergeTmdbPages(pages);
}

export async function getPopularMovieItems(itemCount = TMDB_PAGE_SIZE) {
  const pageCount = pagesForItemCount(itemCount);
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) => getPopularMovies(i + 1))
  );
  return mergeTmdbPages(pages);
}

export async function getPopularTvItems(itemCount = TMDB_PAGE_SIZE) {
  const pageCount = pagesForItemCount(itemCount);
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) => getPopularTv(i + 1))
  );
  return mergeTmdbPages(pages);
}

export async function getUpcomingMovieItems(itemCount = TMDB_PAGE_SIZE) {
  const pageCount = pagesForItemCount(itemCount);
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) => getUpcomingMovies(i + 1))
  );
  return mergeTmdbPages(pages).map((item) => ({ ...item, media_type: "movie" as const }));
}

export async function getUpcomingTvItems(itemCount = TMDB_PAGE_SIZE) {
  const pageCount = pagesForItemCount(itemCount);
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) => getUpcomingTv(i + 1))
  );
  return mergeTmdbPages(pages).map((item) => ({ ...item, media_type: "tv" as const }));
}

export async function discoverMoviesPageRange(
  filters: Record<string, string> = {},
  startPage = 1,
  pageCount = DISCOVER_PAGE_COUNT
) {
  const start = Math.max(1, startPage);
  const count = Math.max(1, pageCount);
  const pages = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      discoverMovies({ ...filters, page: String(start + i) })
    )
  );
  return {
    results: mergeTmdbPages(pages),
    total_pages: pages[0]?.total_pages ?? 1,
  };
}

export async function discoverTvPageRange(
  filters: Record<string, string> = {},
  startPage = 1,
  pageCount = DISCOVER_PAGE_COUNT
) {
  const start = Math.max(1, startPage);
  const count = Math.max(1, pageCount);
  const pages = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      discoverTv({ ...filters, page: String(start + i) })
    )
  );
  return {
    results: mergeTmdbPages(pages),
    total_pages: pages[0]?.total_pages ?? 1,
  };
}

export async function discoverMoviesMultiPage(
  filters: Record<string, string> = {},
  pageCount = DISCOVER_PAGE_COUNT,
  startPage = 1
) {
  const { results } = await discoverMoviesPageRange(filters, startPage, pageCount);
  return results;
}

export async function discoverTvMultiPage(
  filters: Record<string, string> = {},
  pageCount = DISCOVER_PAGE_COUNT,
  startPage = 1
) {
  const { results } = await discoverTvPageRange(filters, startPage, pageCount);
  return results;
}

export async function searchMultiMultiPage(query: string, pageCount = DISCOVER_PAGE_COUNT) {
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) => searchMulti(query, i + 1))
  );
  return mergeTmdbPages(pages);
}

export async function getGenres(mediaType: MediaType) {
  return tmdbFetch<{ genres: Array<{ id: number; name: string }> }>(`/genre/${mediaType}/list`);
}

export interface TmdbLanguage {
  iso_639_1: string;
  english_name: string;
  name: string;
}

export async function getLanguages() {
  return tmdbFetch<TmdbLanguage[]>("/configuration/languages");
}

export async function getExternalIds(mediaType: MediaType, id: number) {
  return tmdbFetch<{ imdb_id?: string; tvdb_id?: number }>(`/${mediaType}/${id}/external_ids`);
}

export async function searchKeyword(query: string) {
  return tmdbFetch<{ results: Array<{ id: number; name: string }> }>(`/search/keyword`, {
    query,
    page: "1",
  });
}

export async function getKeyword(id: number) {
  return tmdbFetch<{ id: number; name: string }>(`/keyword/${id}`);
}

export async function resolveKeywords(ids: number[]) {
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        return await getKeyword(id);
      } catch {
        return { id, name: `Keyword ${id}` };
      }
    })
  );
  return results;
}

export function buildDiscoverFilters(
  criteria: {
    genres?: number[];
    yearMin?: number;
    yearMax?: number;
    dateMin?: string;
    dateMax?: string;
    minRating?: number;
    runtimeMin?: number;
    runtimeMax?: number;
    language?: string;
    withCast?: number[];
    withKeywords?: string;
  },
  mediaType: MediaType = "movie"
): Record<string, string> {
  const filters: Record<string, string> = {};
  const dateGteKey =
    mediaType === "tv" ? "first_air_date.gte" : "primary_release_date.gte";
  const dateLteKey =
    mediaType === "tv" ? "first_air_date.lte" : "primary_release_date.lte";

  if (criteria.genres?.length) {
    if (mediaType === "movie") {
      const { withGenres, extraKeywordIds } = resolveGenreFilters(criteria.genres);
      if (withGenres) filters.with_genres = withGenres;
      if (extraKeywordIds.length) {
        const merged = mergeKeywordIds(criteria.withKeywords, extraKeywordIds);
        if (merged) filters.with_keywords = merged;
      }
    } else {
      filters.with_genres = criteria.genres.filter((id) => id > 0).join(",");
    }
  }
  if (criteria.dateMin) filters[dateGteKey] = criteria.dateMin;
  else if (criteria.yearMin) filters[dateGteKey] = `${criteria.yearMin}-01-01`;
  if (criteria.dateMax) filters[dateLteKey] = criteria.dateMax;
  else if (criteria.yearMax) filters[dateLteKey] = `${criteria.yearMax}-12-31`;
  if (criteria.minRating) filters["vote_average.gte"] = String(criteria.minRating);
  if (criteria.runtimeMin) filters["with_runtime.gte"] = String(criteria.runtimeMin);
  if (criteria.runtimeMax) filters["with_runtime.lte"] = String(criteria.runtimeMax);
  if (criteria.language) filters.with_original_language = criteria.language;
  if (criteria.withCast?.length) filters.with_cast = criteria.withCast.join(",");
  if (criteria.withKeywords && !filters.with_keywords) filters.with_keywords = criteria.withKeywords;
  return filters;
}
