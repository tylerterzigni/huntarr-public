import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { plexLibraryCache, watchHistoryCache } from "@/lib/db/schema";
import { getDecryptedPlexInstance, getDecryptedTautulliInstance } from "@/lib/settings/integrations";
import {
  fetchPlexLibrary,
  fetchPlexMachineIdentifier,
  fetchPlexShowLeafCountsByRatingKeys,
  fetchPlexShowWatchProgressByRatingKeys,
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

export async function syncPlexLibrary() {
  const instance = await getDecryptedPlexInstance();
  if (!instance) {
    throw new Error("No Plex instance configured. Add one in Settings → Plex and ensure it is enabled.");
  }

  clearGuidResolutionCache();
  const items = await fetchPlexLibrary(instance);

  const machineId = await fetchPlexMachineIdentifier(instance);
  if (machineId) {
    await setGlobalSetting("plex_machine_identifier", machineId);
  }

  await db.delete(plexLibraryCache);

  for (const item of items) {
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
  }

  return { synced: items.length };
}

async function upsertWatchHistoryRows(
  values: Array<{
    tautulliUsername: string;
    tmdbId: number;
    mediaType: "movie" | "tv";
    title: string;
    watchedAt?: Date | null;
    ratingKey?: string | null;
    fullyWatched: boolean;
    syncedAt: Date;
  }>
) {
  for (let i = 0; i < values.length; i += 100) {
    const chunk = values.slice(i, i + 100);
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
          title: sql`excluded.title`,
          watchedAt: sql`excluded.watched_at`,
          ratingKey: sql`excluded.rating_key`,
          fullyWatched: sql`excluded.fully_watched`,
          playCount: 1,
          syncedAt: sql`excluded.synced_at`,
        },
      });
  }
}

async function upsertPlexFullyWatchedTv(
  usernames: string[],
  plexInstance: NonNullable<Awaited<ReturnType<typeof getDecryptedPlexInstance>>>
) {
  const tvRows = await db
    .select()
    .from(plexLibraryCache)
    .where(eq(plexLibraryCache.mediaType, "tv"));

  const ratingKeys = tvRows
    .map((row) => row.plexRatingKey)
    .filter((key): key is string => !!key);
  if (ratingKeys.length === 0) return;

  const progress = await fetchPlexShowWatchProgressByRatingKeys(plexInstance, ratingKeys);
  const syncedAt = new Date();
  const values = [];

  for (const username of usernames) {
    for (const row of tvRows) {
      if (!row.plexRatingKey) continue;
      const showProgress = progress.get(row.plexRatingKey);
      if (
        !showProgress ||
        showProgress.leafCount <= 0 ||
        showProgress.viewedLeafCount < showProgress.leafCount
      ) {
        continue;
      }

      values.push({
        tautulliUsername: username,
        tmdbId: row.tmdbId,
        mediaType: "tv" as const,
        title: row.title,
        watchedAt: null,
        ratingKey: row.plexRatingKey,
        fullyWatched: true,
        syncedAt,
      });
    }
  }

  if (values.length > 0) {
    await upsertWatchHistoryRows(values);
  }
}

export async function syncTautulliHistory(usernames: string[]) {
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

  clearGuidResolutionCache();
  const plexInstance = await getDecryptedPlexInstance();
  let total = 0;
  let fetched = 0;
  let movies = 0;
  let tv = 0;

  for (const username of trimmed) {
    const tautulliUser = await resolveTautulliUser(instance, username);
    const rows = await getAllWatchHistory(
      instance,
      tautulliUser.user_id,
      TAUTULLI_HISTORY_PAGE_SIZE,
      TAUTULLI_HISTORY_MAX_RECORDS
    );
    fetched += rows.length;

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

    const fullyWatchedByShow = await computeFullyWatchedByShow(
      instance,
      rows,
      tautulliUser.user_id,
      plexLeafCounts,
      plexWatchProgress,
      username
    );
    const mapped = await mapHistoryToTmdb(instance, rows, plexInstance);

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
  }

  if (plexInstance) {
    await upsertPlexFullyWatchedTv(trimmed, plexInstance);
  }

  return { synced: total, fetched, movies, tv };
}
