import { MediaRow } from "@/components/media/MediaRow";
import { PersonalizedBrowseRow } from "@/components/home/PersonalizedBrowseRow";
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

interface HomeBrowseSectionProps {
  userId: string;
  tmdbConfigured: boolean;
}

export async function HomeBrowseSection({ userId, tmdbConfigured }: HomeBrowseSectionProps) {
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
  const enrichedRecent = withoutHiddenItems(enrichItemsWithStatus(recentRequestItems, statusSets));

  const enrichedTrending = prepareHomeBrowseRow(trendingItems, statusSets);
  const enrichedMovies = prepareHomeBrowseRow(popularMovieItems, statusSets);
  const enrichedUpcomingMovies = prepareHomeBrowseRow(upcomingMovieItems, statusSets);
  const enrichedTv = prepareHomeBrowseRow(popularTvItems, statusSets);
  const enrichedUpcomingTv = prepareHomeBrowseRow(upcomingTvItems, statusSets);

  const hasBrowseData =
    enrichedTrending.length > 0 ||
    enrichedMovies.length > 0 ||
    enrichedUpcomingMovies.length > 0 ||
    enrichedTv.length > 0 ||
    enrichedUpcomingTv.length > 0;

  return (
    <>
      {tmdbConfigured && !hasBrowseData && recentRequests.length === 0 && (
        <div className="mx-4 md:mx-8 mb-8 rounded-lg border border-gray-300/70 bg-white/40 p-4 text-sm text-muted-foreground backdrop-blur-md">
          No browse data available yet. Configure TMDB and sync Tautulli history for personalized
          rows.
        </div>
      )}
      <PersonalizedBrowseRow
        title="Trending This Week"
        initialItems={enrichedTrending}
        defaultOrderLabel="global trending"
      />
      <PersonalizedBrowseRow
        title="Popular Movies"
        initialItems={enrichedMovies}
        defaultOrderLabel="popularity"
      />
      <PersonalizedBrowseRow
        title="Upcoming Movies"
        initialItems={enrichedUpcomingMovies}
        defaultOrderLabel="popularity"
      />
      <PersonalizedBrowseRow
        title="Popular TV Shows"
        initialItems={enrichedTv}
        defaultOrderLabel="popularity"
      />
      <PersonalizedBrowseRow
        title="Upcoming Series"
        initialItems={enrichedUpcomingTv}
        defaultOrderLabel="popularity"
      />
      <MediaRow
        title="Recent Requests"
        items={enrichedRecent}
        showReason={false}
        applyVisibilityFilter={false}
      />
    </>
  );
}
