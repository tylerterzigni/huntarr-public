import { eq, or, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { hideListItems, plexLibraryCache, watchHistoryCache } from "@/lib/db/schema";
import { getArrLibraryIds } from "@/lib/integrations/arr/library";
import { inferMediaType } from "@/lib/integrations/tmdb/helpers";
import { localePriorityScore } from "./locale-priority";
import type { MediaType, SearchCriteria, TmdbMediaItem, RecommendationItem } from "@/types";

export async function getHiddenIds(userId: string): Promise<Set<string>> {
  const rows = await db
    .select()
    .from(hideListItems)
    .where(
      or(
        eq(hideListItems.scope, "global"),
        and(eq(hideListItems.scope, "user"), eq(hideListItems.userId, userId))
      )
    );

  return new Set(rows.map((r) => `${r.mediaType}:${r.tmdbId}`));
}

export async function getWatchedIds(usernames: string[]): Promise<Set<string>> {
  if (usernames.length === 0) return new Set();
  const rows = await db.select().from(watchHistoryCache);
  const filtered = rows.filter((r) => usernames.includes(r.tautulliUsername));
  return new Set(filtered.map((r) => `${r.mediaType}:${r.tmdbId}`));
}

/**
 * IDs to exclude from recommendation rows only (not search or discover tabs).
 * Movies: any Tautulli watch counts as fully watched. TV: all available episodes watched.
 */
export async function getFullyWatchedIds(usernames: string[]): Promise<Set<string>> {
  if (usernames.length === 0) return new Set();
  const rows = await db.select().from(watchHistoryCache);
  const filtered = rows.filter((r) => usernames.includes(r.tautulliUsername));
  return new Set(
    filtered
      .filter((r) => r.mediaType === "movie" || r.fullyWatched)
      .map((r) => `${r.mediaType}:${r.tmdbId}`)
  );
}

export async function getPlexLibraryIds(): Promise<Set<string>> {
  const plexRows = await db
    .select()
    .from(plexLibraryCache)
    .where(eq(plexLibraryCache.inLibrary, true));
  return new Set(plexRows.map((r) => `${r.mediaType}:${r.tmdbId}`));
}

export async function getLibraryIds(): Promise<Set<string>> {
  const [plexRows, arrIds] = await Promise.all([
    db.select().from(plexLibraryCache).where(eq(plexLibraryCache.inLibrary, true)),
    getArrLibraryIds().catch(() => new Set<string>()),
  ]);

  const ids = new Set(plexRows.map((r) => `${r.mediaType}:${r.tmdbId}`));
  for (const id of arrIds) ids.add(id);
  return ids;
}

export function withoutLibraryItems<T extends TmdbMediaItem>(
  items: T[],
  libraryIds: Set<string>
): T[] {
  return items.filter((item) => !libraryIds.has(`${inferMediaType(item)}:${item.id}`));
}

export function withoutHiddenItems<T extends RecommendationItem>(items: T[]): T[] {
  return items.filter((item) => !item.hidden);
}

export function withoutHiddenOrLibraryItems<T extends RecommendationItem>(
  items: T[]
): T[] {
  return items.filter((item) => !item.hidden && !item.inLibrary);
}

export function withoutFullyWatchedItems<T extends RecommendationItem>(
  items: T[],
  fullyWatchedIds: Set<string>
): T[] {
  return items.filter((item) => {
    const key = `${inferMediaType(item)}:${item.id}`;
    return !fullyWatchedIds.has(key);
  });
}

export function filterMediaItems(
  items: TmdbMediaItem[],
  options: {
    hiddenIds: Set<string>;
    libraryIds: Set<string>;
    criteria: SearchCriteria;
    fullyWatchedIds?: Set<string>;
  }
): TmdbMediaItem[] {
  return items.filter((item) => {
    const mediaType = inferMediaType(item);
    const key = `${mediaType}:${item.id}`;

    if (options.criteria.excludeHidden !== false && options.hiddenIds.has(key)) return false;
    if (
      options.criteria.excludeWatched &&
      options.fullyWatchedIds?.has(key)
    ) {
      return false;
    }
    if (options.criteria.excludeInLibrary && options.libraryIds.has(key)) return false;

    return true;
  });
}

export function scoreItem(
  item: TmdbMediaItem,
  profile: {
    genres: Record<string, number>;
    decades: Record<string, number>;
    avgRating?: number | null;
  },
  criteria: SearchCriteria
): number {
  let score = item.vote_average ?? 5;

  const date = item.release_date ?? item.first_air_date;
  if (date) {
    const decade = `${date.slice(0, 3)}0s`;
    score += (profile.decades[decade] ?? 0) * 0.5;
  }

  if (item.genre_ids) {
    for (const gid of item.genre_ids) {
      score += (profile.genres[String(gid)] ?? 0) * 0.3;
    }
  }

  if (criteria.minRating && (item.vote_average ?? 0) < criteria.minRating) {
    score -= 5;
  }

  const voteAverage = item.vote_average ?? 0;
  if (voteAverage >= 8) score += 3;
  else if (voteAverage >= 7) score += 1.5;
  else if (voteAverage > 0 && voteAverage < 5) score -= 3;

  score += localePriorityScore(item);

  return score;
}

export async function getStatusIdSets(userId: string, usernames: string[] = []) {
  const [hiddenIds, libraryIds, watchedIds, fullyWatchedIds] = await Promise.all([
    getHiddenIds(userId),
    getLibraryIds(),
    getWatchedIds(usernames),
    getFullyWatchedIds(usernames),
  ]);
  return { hiddenIds, libraryIds, watchedIds, fullyWatchedIds };
}

export function enrichItemsWithStatus(
  items: TmdbMediaItem[],
  sets: {
    hiddenIds: Set<string>;
    libraryIds: Set<string>;
    watchedIds: Set<string>;
    fullyWatchedIds: Set<string>;
  }
): RecommendationItem[] {
  return items.map((item) => {
    const mediaType = inferMediaType(item);
    const key = `${mediaType}:${item.id}`;
    return {
      ...item,
      inLibrary: sets.libraryIds.has(key),
      watched: sets.watchedIds.has(key),
      fullyWatched:
        sets.fullyWatchedIds.has(key) ||
        (mediaType === "movie" && sets.watchedIds.has(key)),
      hidden: sets.hiddenIds.has(key),
    };
  });
}

export async function enrichWithStatus(
  items: TmdbMediaItem[],
  userId: string,
  usernames: string[] = []
): Promise<RecommendationItem[]> {
  const sets = await getStatusIdSets(userId, usernames);
  return enrichItemsWithStatus(items, sets);
}
