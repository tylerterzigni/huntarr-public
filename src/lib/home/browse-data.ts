import { cache } from "react";
import {
  getMediaItemBrief,
  getPopularMovieItems,
  getPopularTvItems,
  getTrendingItems,
  getUpcomingMovieItems,
  getUpcomingTvItems,
} from "@/lib/integrations/tmdb/client";
import { HOME_ROW_POOL_LIMIT } from "@/lib/recommendations/constants";
import {
  enrichItemsWithStatus,
  getStatusIdSets,
  withoutHiddenItems,
} from "@/lib/recommendations/filters";
import {
  HOME_LOCALE_FETCH_MULTIPLIER,
  prioritizeHomeLocaleItems,
} from "@/lib/recommendations/locale-priority";
import { db } from "@/lib/db";
import { arrRequestsLog, userPreferences } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import type { MediaType, TmdbMediaItem } from "@/types";

const HOME_FETCH_LIMIT = HOME_ROW_POOL_LIMIT * HOME_LOCALE_FETCH_MULTIPLIER;

function prepareHomeBrowseRow(
  items: TmdbMediaItem[],
  statusSets: Awaited<ReturnType<typeof getStatusIdSets>>
): TmdbMediaItem[] {
  return prioritizeHomeLocaleItems(
    withoutHiddenItems(enrichItemsWithStatus(items, statusSets)),
    HOME_ROW_POOL_LIMIT
  );
}

type ArrRequestRow = typeof arrRequestsLog.$inferSelect;

function dedupeRecentRequests(requests: ArrRequestRow[]): ArrRequestRow[] {
  const seen = new Set<string>();
  return requests.filter((req) => {
    const key = `${req.mediaType}:${req.tmdbId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function toRecentRequestMediaItems(
  requests: ArrRequestRow[],
  tmdbConfigured: boolean
): Promise<TmdbMediaItem[]> {
  const unique = dedupeRecentRequests(requests);

  if (!tmdbConfigured) {
    return unique.map((req) => ({
      id: req.tmdbId,
      media_type: req.mediaType,
      ...(req.mediaType === "movie" ? { title: req.title } : { name: req.title }),
    }));
  }

  return Promise.all(
    unique.map(async (req) => {
      const brief = await getMediaItemBrief(req.mediaType as MediaType, req.tmdbId);
      if (brief) return brief;
      return {
        id: req.tmdbId,
        media_type: req.mediaType,
        ...(req.mediaType === "movie" ? { title: req.title } : { name: req.title }),
      };
    })
  );
}

export type HomeBrowseData = {
  trending: TmdbMediaItem[];
  popularTv: TmdbMediaItem[];
  upcomingTv: TmdbMediaItem[];
  popularMovies: TmdbMediaItem[];
  upcomingMovies: TmdbMediaItem[];
  recentRequests: TmdbMediaItem[];
  recentRequestCount: number;
  hasBrowseData: boolean;
};

/** One shared fetch per request so ordered Suspense rows do not hit TMDB repeatedly. */
export const getHomeBrowseData = cache(
  async (userId: string, tmdbConfigured: boolean): Promise<HomeBrowseData> => {
    const [prefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);
    const usernames = prefs?.tautulliUsernames ?? [];

    const [
      trendingItems,
      popularMovieItems,
      upcomingMovieItems,
      popularTvItems,
      upcomingTvItems,
      statusSets,
      recentRequests,
    ] = await Promise.all([
      getTrendingItems("week", HOME_FETCH_LIMIT).catch(() => []),
      getPopularMovieItems(HOME_FETCH_LIMIT).catch(() => []),
      getUpcomingMovieItems(HOME_FETCH_LIMIT).catch(() => []),
      getPopularTvItems(HOME_FETCH_LIMIT).catch(() => []),
      getUpcomingTvItems(HOME_FETCH_LIMIT).catch(() => []),
      getStatusIdSets(userId, usernames),
      db
        .select()
        .from(arrRequestsLog)
        .where(eq(arrRequestsLog.userId, userId))
        .orderBy(desc(arrRequestsLog.createdAt))
        .limit(10),
    ]);

    const recentRequestItems = await toRecentRequestMediaItems(recentRequests, tmdbConfigured);
    const recentRequestsEnriched = withoutHiddenItems(
      enrichItemsWithStatus(recentRequestItems, statusSets)
    );

    const trending = prepareHomeBrowseRow(trendingItems, statusSets);
    const popularMovies = prepareHomeBrowseRow(popularMovieItems, statusSets);
    const upcomingMovies = prepareHomeBrowseRow(upcomingMovieItems, statusSets);
    const popularTv = prepareHomeBrowseRow(popularTvItems, statusSets);
    const upcomingTv = prepareHomeBrowseRow(upcomingTvItems, statusSets);

    const hasBrowseData =
      trending.length > 0 ||
      popularMovies.length > 0 ||
      upcomingMovies.length > 0 ||
      popularTv.length > 0 ||
      upcomingTv.length > 0;

  return {
    trending,
    popularTv,
    upcomingTv,
    popularMovies,
    upcomingMovies,
    recentRequests: recentRequestsEnriched,
    recentRequestCount: recentRequests.length,
    hasBrowseData,
  };
  }
);

