import {
  getDecryptedArrInstance,
  getDefaultInstance,
  type DecryptedInstance,
} from "@/lib/settings/integrations";
import {
  addRadarrMovie,
  deleteRadarrMovie,
  findExistingRadarrMovie,
  getRadarrProfiles,
  getRadarrRootFolders,
  lookupRadarrMovie,
  searchRadarrMovies,
  updateRadarrMovie,
  type RadarrMovieResource,
} from "@/lib/integrations/radarr/client";
import {
  addSonarrSeries,
  deleteSonarrSeries,
  findExistingSonarrSeries,
  getSonarrEpisodes,
  getSonarrProfiles,
  getSonarrRootFolders,
  lookupSonarrSeriesMatch,
  searchSonarrSeries,
  setSonarrEpisodeMonitor,
  updateSonarrSeries,
} from "@/lib/integrations/sonarr/client";
import { getExternalIds } from "@/lib/integrations/tmdb/client";
import { clearArrLibraryCache } from "@/lib/integrations/arr/library";
import type { ArrCredentials, MediaType } from "@/types";

type ArrInstance = DecryptedInstance<ArrCredentials>;

type SeasonRecord = Record<string, unknown> & { seasonNumber?: number; monitored?: boolean };

function asSeasonRecords(value: unknown): SeasonRecord[] {
  return Array.isArray(value) ? (value as SeasonRecord[]) : [];
}

/** The instance a reminder was parked in, else the default Radarr (movie) / Sonarr (tv). */
export async function resolveReminderInstance(
  mediaType: MediaType,
  instanceId?: string | null
): Promise<ArrInstance | null> {
  if (instanceId) {
    const stored = await getDecryptedArrInstance(instanceId);
    if (stored) return stored;
  }
  const row = await getDefaultInstance(mediaType === "movie" ? "radarr" : "sonarr");
  return row ? getDecryptedArrInstance(row.id) : null;
}

async function addDefaults(instance: ArrInstance, mediaType: MediaType) {
  const { defaultQualityProfileId, defaultRootFolder } = instance.config;
  const [profiles, rootFolders] = await Promise.all([
    defaultQualityProfileId
      ? []
      : mediaType === "movie"
        ? getRadarrProfiles(instance)
        : getSonarrProfiles(instance),
    defaultRootFolder
      ? []
      : mediaType === "movie"
        ? getRadarrRootFolders(instance)
        : getSonarrRootFolders(instance),
  ]);
  const rootFolderPath = defaultRootFolder ?? rootFolders[0]?.path;
  if (!rootFolderPath) {
    throw new Error(`No root folder configured in ${instance.name}`);
  }
  return {
    qualityProfileId: defaultQualityProfileId ?? profiles[0]?.id ?? 1,
    rootFolderPath,
  };
}

async function findSeries(instance: ArrInstance, tmdbId: number) {
  let tvdbId: number | undefined;
  let imdbId: string | undefined;
  try {
    const external = await getExternalIds("tv", tmdbId);
    tvdbId = external.tvdb_id ?? undefined;
    imdbId = external.imdb_id ?? undefined;
  } catch {
    // Sonarr can still match via tmdb: or title if TMDB extras fail.
  }
  const existing = await findExistingSonarrSeries(instance, { tvdbId, tmdbId });
  return { existing, tvdbId, imdbId };
}

/**
 * Add the title to Radarr/Sonarr unmonitored with no search. Titles already in
 * Arr are left untouched. Returns whether Huntarr created the Arr entry.
 */
export async function parkInArr(
  instance: ArrInstance,
  mediaType: MediaType,
  tmdbId: number,
  title: string
): Promise<boolean> {
  if (mediaType === "movie") {
    if (await findExistingRadarrMovie(instance, tmdbId)) return false;
    const movie = await lookupRadarrMovie(instance, tmdbId);
    if (!movie) throw new Error("Movie not found on TMDB/Radarr");

    const created = (await addRadarrMovie(instance, {
      ...movie,
      ...(await addDefaults(instance, "movie")),
      monitored: false,
      addOptions: { searchForMovie: false, monitor: "none" },
    })) as RadarrMovieResource;
    // Older Radarr builds ignore addOptions.monitor; make sure it stays unmonitored.
    if (created?.id && created.monitored) {
      await updateRadarrMovie(instance, { ...created, monitored: false });
    }
  } else {
    const { existing, tvdbId, imdbId } = await findSeries(instance, tmdbId);
    if (existing) return false;
    const series = await lookupSonarrSeriesMatch(instance, { tmdbId, tvdbId, imdbId, title });
    if (!series) throw new Error("Series not found");

    await addSonarrSeries(instance, {
      ...series,
      ...(await addDefaults(instance, "tv")),
      languageProfileId: instance.config.defaultLanguageProfileId ?? 1,
      seasonFolder: true,
      monitored: false,
      seasons: asSeasonRecords(series.seasons).map((season) => ({ ...season, monitored: false })),
      seriesType: instance.config.defaultSeriesType ?? "standard",
      addOptions: {
        monitor: "none",
        searchForMissingEpisodes: false,
        searchForCutoffUnmetEpisodes: false,
      },
    });
  }

  clearArrLibraryCache();
  return true;
}

/** Turn monitoring on (all non-special seasons for TV) and start a search. */
export async function activateInArr(
  instance: ArrInstance,
  mediaType: MediaType,
  tmdbId: number,
  title: string
) {
  if (mediaType === "movie") {
    let movie = await findExistingRadarrMovie(instance, tmdbId);
    if (!movie) {
      await parkInArr(instance, mediaType, tmdbId, title);
      movie = await findExistingRadarrMovie(instance, tmdbId);
    }
    if (!movie) throw new Error("Movie not found in Radarr");

    await updateRadarrMovie(instance, { ...movie, monitored: true });
    await searchRadarrMovies(instance, [movie.id]);
  } else {
    let { existing } = await findSeries(instance, tmdbId);
    if (!existing) {
      await parkInArr(instance, mediaType, tmdbId, title);
      ({ existing } = await findSeries(instance, tmdbId));
    }
    if (!existing) throw new Error("Series not found in Sonarr");

    const seasons = asSeasonRecords(existing.seasons).map((season) => ({
      ...season,
      monitored: Number(season.seasonNumber ?? 0) > 0,
    }));
    const updated = await updateSonarrSeries(instance, { ...existing, monitored: true, seasons });
    const seriesId = updated.id ?? existing.id;

    // Sonarr normally cascades season monitoring to episodes; enforce it in case it didn't.
    const episodes = await getSonarrEpisodes(instance, seriesId);
    await setSonarrEpisodeMonitor(
      instance,
      episodes
        .filter((episode) => episode.seasonNumber > 0 && !episode.monitored)
        .map((episode) => episode.id),
      true
    );
    await searchSonarrSeries(instance, seriesId);
  }

  clearArrLibraryCache();
}

/**
 * Remove a parked title from Arr, but only while it is still unmonitored and
 * has no files — anything since requested or downloaded stays.
 * Returns true when the Arr entry was deleted.
 */
export async function removeParkedFromArr(
  instance: ArrInstance,
  mediaType: MediaType,
  tmdbId: number
): Promise<boolean> {
  if (mediaType === "movie") {
    const movie = await findExistingRadarrMovie(instance, tmdbId);
    if (!movie || movie.monitored || movie.hasFile) return false;
    await deleteRadarrMovie(instance, movie.id);
  } else {
    const { existing } = await findSeries(instance, tmdbId);
    if (!existing || existing.monitored) return false;
    const episodes = await getSonarrEpisodes(instance, existing.id);
    if (episodes.some((episode) => episode.hasFile || episode.monitored)) return false;
    await deleteSonarrSeries(instance, existing.id);
  }

  clearArrLibraryCache();
  return true;
}
