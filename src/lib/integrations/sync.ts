import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { plexLibraryCache, watchHistoryCache } from "@/lib/db/schema";
import { getDecryptedPlexInstance, getDecryptedTautulliInstance } from "@/lib/settings/integrations";
import {
  fetchPlexLibrary,
  fetchPlexMachineIdentifier,
  fetchPlexMovieWatchStateByRatingKeys,
  fetchPlexShowLeafCountsByRatingKeys,
  fetchPlexShowWatchProgressByRatingKeys,
  type PlexLibraryItem,
} from "@/lib/integrations/plex/client";
import {
  getAllWatchHistory,
  mapHistoryToTmdb,
  resolveTautulliUser,
  computeFullyWatchedByShow,
  getShowWatchedEpisodeKeys,
} from "@/lib/integrations/tautulli/client";
import { buildFullyWatchedTvUpserts } from "@/lib/integrations/watch-completion";
import { clearGuidResolutionCache } from "@/lib/integrations/guid-to-tmdb";
import { setGlobalSetting } from "@/lib/settings/global";
import {
  TAUTULLI_HISTORY_MAX_RECORDS,
  TAUTULLI_HISTORY_PAGE_SIZE,
} from "@/lib/recommendations/constants";
import {
  phaseProgress,
  reportSyncProgress,
  type SyncProgressCallback,
} from "@/lib/integrations/sync-progress";

type WatchHistoryUpsert = {
  tautulliUsername: string;
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  watchedAt?: Date | null;
  ratingKey?: string | null;
  fullyWatched: boolean;
  syncedAt: Date;
};

function isPlexItemWatched(item: PlexLibraryItem): boolean {
  if (item.mediaType === "movie") return item.viewCount > 0;
  return item.viewedLeafCount > 0;
}

function isPlexItemFullyWatched(item: PlexLibraryItem): boolean {
  if (item.mediaType === "movie") return item.viewCount > 0;
  return item.leafCount > 0 && item.viewedLeafCount >= item.leafCount;
}

/** One row per username + mediaType + tmdbId (keeps newest watchedAt / fullyWatched). */
function dedupeWatchHistoryUpserts(values: WatchHistoryUpsert[]): WatchHistoryUpsert[] {
  const byKey = new Map<string, WatchHistoryUpsert>();

  for (const value of values) {
    const key = `${value.tautulliUsername}:${value.mediaType}:${value.tmdbId}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, value);
      continue;
    }

    const existingTime = existing.watchedAt?.getTime() ?? 0;
    const nextTime = value.watchedAt?.getTime() ?? 0;
    byKey.set(key, {
      ...existing,
      title: value.title || existing.title,
      ratingKey: value.ratingKey ?? existing.ratingKey,
      watchedAt:
        nextTime > existingTime
          ? value.watchedAt
          : existing.watchedAt ?? value.watchedAt ?? null,
      fullyWatched: existing.fullyWatched || value.fullyWatched,
      syncedAt: value.syncedAt > existing.syncedAt ? value.syncedAt : existing.syncedAt,
    });
  }

  return [...byKey.values()];
}

function plexWatchedUpserts(
  items: PlexLibraryItem[],
  usernames: string[],
  syncedAt: Date
): WatchHistoryUpsert[] {
  const watched = items.filter(isPlexItemWatched);
  if (watched.length === 0 || usernames.length === 0) return [];

  const values: WatchHistoryUpsert[] = [];
  for (const username of usernames) {
    for (const item of watched) {
      values.push({
        tautulliUsername: username,
        tmdbId: item.tmdbId,
        mediaType: item.mediaType,
        title: item.title,
        watchedAt: item.lastViewedAt,
        ratingKey: item.plexRatingKey,
        fullyWatched: isPlexItemFullyWatched(item),
        syncedAt,
      });
    }
  }

  return dedupeWatchHistoryUpserts(values);
}

export async function syncPlexLibrary(
  usernames: string[] = [],
  onProgress?: SyncProgressCallback
) {
  const instance = await getDecryptedPlexInstance();
  if (!instance) {
    throw new Error("No Plex instance configured. Add one in Settings → Plex and ensure it is enabled.");
  }

  reportSyncProgress(onProgress, {
    phase: "fetch",
    current: 0,
    total: 100,
    message: "Connecting to Plex…",
  });

  clearGuidResolutionCache();
  const items = await fetchPlexLibrary(instance, (progress) => {
    const fraction =
      progress.sectionTotal > 0 ? progress.sectionIndex / progress.sectionTotal : 0;
    const { current, total } = phaseProgress(0, 55, fraction);
    reportSyncProgress(onProgress, {
      phase: "fetch",
      current,
      total,
      message:
        progress.sectionTitle === "done"
          ? `Fetched ${progress.resolvedItems} library items`
          : `Scanning “${progress.sectionTitle}” (${progress.sectionIndex + 1}/${progress.sectionTotal})…`,
    });
  });

  reportSyncProgress(onProgress, {
    phase: "machine",
    ...phaseProgress(55, 60, 1),
    message: "Saving Plex server identity…",
  });

  const machineId = await fetchPlexMachineIdentifier(instance);
  if (machineId) {
    await setGlobalSetting("plex_machine_identifier", machineId);
  }

  reportSyncProgress(onProgress, {
    phase: "save",
    ...phaseProgress(60, 85, 0),
    message: `Writing ${items.length} items to library cache…`,
  });

  await db.delete(plexLibraryCache);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    await db
      .insert(plexLibraryCache)
      .values({
        tmdbId: item.tmdbId,
        mediaType: item.mediaType,
        title: item.title,
        inLibrary: true,
        plexGuid: item.plexGuid,
        plexRatingKey: item.plexRatingKey,
      })
      .onConflictDoNothing();

    if (i === items.length - 1 || i % 50 === 0) {
      const fraction = items.length > 0 ? (i + 1) / items.length : 1;
      reportSyncProgress(onProgress, {
        phase: "save",
        ...phaseProgress(60, 85, fraction),
        message: `Writing library cache (${i + 1}/${items.length})…`,
      });
    }
  }

  const trimmed = usernames.map((u) => u.trim()).filter(Boolean);
  let watchedSynced = 0;
  if (trimmed.length > 0) {
    reportSyncProgress(onProgress, {
      phase: "watched",
      ...phaseProgress(85, 100, 0),
      message: "Updating watched titles from Plex…",
    });
    const watchedRows = plexWatchedUpserts(items, trimmed, new Date());
    if (watchedRows.length > 0) {
      await upsertWatchHistoryRows(watchedRows);
      watchedSynced = watchedRows.length;
    }
  }

  reportSyncProgress(onProgress, {
    phase: "done",
    current: 100,
    total: 100,
    message: `Synced ${items.length} library items`,
  });

  return { synced: items.length, watchedSynced };
}

async function upsertWatchHistoryRows(values: WatchHistoryUpsert[]) {
  const deduped = dedupeWatchHistoryUpserts(values);

  for (let i = 0; i < deduped.length; i += 100) {
    const chunk = deduped.slice(i, i + 100);
    await db
      .insert(watchHistoryCache)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          watchHistoryCache.tautulliUsername,
          watchHistoryCache.tmdbId,
          watchHistoryCache.mediaType,
        ],
        set: {
          title: sql`COALESCE(NULLIF(excluded.title, ''), ${watchHistoryCache.title})`,
          watchedAt: sql`CASE
            WHEN excluded.watched_at IS NULL THEN ${watchHistoryCache.watchedAt}
            WHEN ${watchHistoryCache.watchedAt} IS NULL THEN excluded.watched_at
            WHEN excluded.watched_at > ${watchHistoryCache.watchedAt} THEN excluded.watched_at
            ELSE ${watchHistoryCache.watchedAt}
          END`,
          ratingKey: sql`COALESCE(excluded.rating_key, ${watchHistoryCache.ratingKey})`,
          fullyWatched: sql`${watchHistoryCache.fullyWatched} OR excluded.fully_watched`,
          playCount: 1,
          syncedAt: sql`excluded.synced_at`,
        },
      });
  }
}

/**
 * When Tautulli sync runs without a fresh library pull, merge Plex-watched
 * movies/shows from the existing library cache into watch history.
 */
async function upsertPlexWatchedFromCache(
  usernames: string[],
  plexInstance: NonNullable<Awaited<ReturnType<typeof getDecryptedPlexInstance>>>
) {
  const rows = await db.select().from(plexLibraryCache);
  if (rows.length === 0) return;

  const movieKeys = rows
    .filter((row) => row.mediaType === "movie" && row.plexRatingKey)
    .map((row) => row.plexRatingKey as string);
  const tvKeys = rows
    .filter((row) => row.mediaType === "tv" && row.plexRatingKey)
    .map((row) => row.plexRatingKey as string);

  const [progress, movieWatch] = await Promise.all([
    fetchPlexShowWatchProgressByRatingKeys(plexInstance, tvKeys),
    fetchPlexMovieWatchStateByRatingKeys(plexInstance, movieKeys),
  ]);

  const syncedAt = new Date();
  const values: WatchHistoryUpsert[] = [];

  for (const username of usernames) {
    for (const row of rows) {
      if (!row.plexRatingKey) continue;

      if (row.mediaType === "movie") {
        const state = movieWatch.get(row.plexRatingKey);
        if (!state || state.viewCount <= 0) continue;
        values.push({
          tautulliUsername: username,
          tmdbId: row.tmdbId,
          mediaType: "movie",
          title: row.title,
          watchedAt: state.lastViewedAt,
          ratingKey: row.plexRatingKey,
          fullyWatched: true,
          syncedAt,
        });
        continue;
      }

      const showProgress = progress.get(row.plexRatingKey);
      if (!showProgress || showProgress.viewedLeafCount <= 0) continue;

      values.push({
        tautulliUsername: username,
        tmdbId: row.tmdbId,
        mediaType: "tv",
        title: row.title,
        watchedAt: null,
        ratingKey: row.plexRatingKey,
        fullyWatched:
          showProgress.leafCount > 0 &&
          showProgress.viewedLeafCount >= showProgress.leafCount,
        syncedAt,
      });
    }
  }

  if (values.length > 0) {
    await upsertWatchHistoryRows(values);
  }
}

export async function syncTautulliHistory(
  usernames: string[],
  onProgress?: SyncProgressCallback
) {
  const instance = await getDecryptedTautulliInstance();
  if (!instance) {
    throw new Error("No Tautulli instance configured. Add one in Settings → Tautulli and ensure it is enabled.");
  }

  const trimmed = usernames.map((u) => u.trim()).filter(Boolean);
  if (trimmed.length === 0) {
    throw new Error(
      "No Tautulli users configured. Add display names under Settings → Tautulli before syncing."
    );
  }

  reportSyncProgress(onProgress, {
    phase: "start",
    current: 0,
    total: 100,
    message: `Syncing watch history for ${trimmed.length} user${trimmed.length === 1 ? "" : "s"}…`,
  });

  clearGuidResolutionCache();
  const plexInstance = await getDecryptedPlexInstance();
  let total = 0;
  let fetched = 0;
  let movies = 0;
  let tv = 0;

  // Reserve 0–90% for per-user work; 90–100% for final Plex merge.
  const userSpan = 90 / trimmed.length;

  for (let userIndex = 0; userIndex < trimmed.length; userIndex++) {
    const username = trimmed[userIndex];
    const userStart = userIndex * userSpan;

    reportSyncProgress(onProgress, {
      phase: "resolve-user",
      ...phaseProgress(userStart, userStart + userSpan * 0.1, 1),
      message: `Resolving Tautulli user “${username}”…`,
    });

    const tautulliUser = await resolveTautulliUser(instance, username);

    reportSyncProgress(onProgress, {
      phase: "fetch-history",
      ...phaseProgress(userStart + userSpan * 0.1, userStart + userSpan * 0.35, 0),
      message: `Fetching watch history for “${username}”…`,
    });

    const rows = await getAllWatchHistory(
      instance,
      tautulliUser.user_id,
      TAUTULLI_HISTORY_PAGE_SIZE,
      TAUTULLI_HISTORY_MAX_RECORDS
    );
    fetched += rows.length;

    reportSyncProgress(onProgress, {
      phase: "fetch-history",
      ...phaseProgress(userStart + userSpan * 0.1, userStart + userSpan * 0.35, 1),
      message: `Fetched ${rows.length} history entries for “${username}”`,
    });

    const showRatingKeys = [
      ...new Set(
        rows
          .filter((row) => row.media_type === "episode")
          .map((row) => row.grandparent_rating_key ?? row.rating_key)
          .filter((key): key is string => !!key)
      ),
    ];

    const plexTvRows = await db
      .select({ plexRatingKey: plexLibraryCache.plexRatingKey })
      .from(plexLibraryCache)
      .where(eq(plexLibraryCache.mediaType, "tv"));
    const plexRatingKeys = plexTvRows
      .map((row) => row.plexRatingKey)
      .filter((key): key is string => !!key);
    const allShowRatingKeys = [...new Set([...showRatingKeys, ...plexRatingKeys])];

    reportSyncProgress(onProgress, {
      phase: "enrich",
      ...phaseProgress(userStart + userSpan * 0.35, userStart + userSpan * 0.5, 0),
      message: `Enriching “${username}” with Plex progress…`,
    });

    let plexLeafCounts = new Map<string, number>();
    let plexWatchProgress = new Map<
      string,
      { leafCount: number; viewedLeafCount: number }
    >();
    if (plexInstance && allShowRatingKeys.length > 0) {
      try {
        plexWatchProgress = await fetchPlexShowWatchProgressByRatingKeys(
          plexInstance,
          allShowRatingKeys
        );
        plexLeafCounts = await fetchPlexShowLeafCountsByRatingKeys(
          plexInstance,
          allShowRatingKeys
        );
      } catch {
        // Plex enrichment is optional.
      }
    }

    reportSyncProgress(onProgress, {
      phase: "map",
      ...phaseProgress(userStart + userSpan * 0.5, userStart + userSpan * 0.8, 0),
      message: `Mapping “${username}” history to TMDB…`,
    });

    const fullyWatchedByShow = await computeFullyWatchedByShow(
      instance,
      rows,
      tautulliUser.user_id,
      plexLeafCounts,
      plexWatchProgress,
      username
    );
    const mapped = await mapHistoryToTmdb(instance, rows, plexInstance);

    reportSyncProgress(onProgress, {
      phase: "save",
      ...phaseProgress(userStart + userSpan * 0.8, userStart + userSpan, 0),
      message: `Saving “${username}” watch history…`,
    });

    const syncedAt = new Date();
    const values = mapped.map((item) => ({
      tautulliUsername: username,
      tmdbId: item.tmdbId,
      mediaType: item.mediaType,
      title: item.title,
      watchedAt: item.watchedAt,
      ratingKey: item.ratingKey,
      fullyWatched:
        item.mediaType === "movie"
          ? true
          : (fullyWatchedByShow.get(`${username}|${item.ratingKey}`) ?? false),
      syncedAt,
    }));

    await upsertWatchHistoryRows(values);

    const fullyWatchedTv = await buildFullyWatchedTvUpserts(
      instance,
      rows,
      tautulliUser.user_id,
      username,
      getShowWatchedEpisodeKeys,
      plexLeafCounts,
      plexWatchProgress,
      plexInstance
    );
    if (fullyWatchedTv.length > 0) {
      await upsertWatchHistoryRows(
        fullyWatchedTv.map((entry) => ({
          ...entry,
          watchedAt: null,
          syncedAt,
        }))
      );
    }

    for (const item of mapped) {
      if (item.mediaType === "movie") movies++;
      else tv++;
      total++;
    }

    reportSyncProgress(onProgress, {
      phase: "save",
      ...phaseProgress(userStart + userSpan * 0.8, userStart + userSpan, 1),
      message: `Saved ${mapped.length} titles for “${username}”`,
    });
  }

  if (plexInstance) {
    reportSyncProgress(onProgress, {
      phase: "plex-merge",
      ...phaseProgress(90, 100, 0),
      message: "Merging Plex watched titles into history…",
    });
    // Merge Plex-watched movies + shows (any viewed episodes) into seed/search history.
    await upsertPlexWatchedFromCache(trimmed, plexInstance);
  }

  reportSyncProgress(onProgress, {
    phase: "done",
    current: 100,
    total: 100,
    message: `Synced ${total} titles from ${fetched} history entries`,
  });

  return { synced: total, fetched, movies, tv };
}
