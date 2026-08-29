import { getRadarrMovies } from "@/lib/integrations/radarr/client";
import { getSonarrSeries } from "@/lib/integrations/sonarr/client";
import { getDecryptedArrInstance, getIntegrationInstances } from "@/lib/settings/integrations";

const CACHE_TTL_MS = 5 * 60 * 1000;

type ArrLibraryCache = {
  ids: Set<string>;
  downloadedMovieIds: Set<string>;
  expiresAt: number;
};

let arrLibraryCache: ArrLibraryCache | null = null;
let arrLibraryLoad: Promise<ArrLibraryCache> | null = null;

export function clearArrLibraryCache() {
  arrLibraryCache = null;
  arrLibraryLoad = null;
}

async function loadArrLibraryCache(): Promise<ArrLibraryCache> {
  if (arrLibraryCache && Date.now() < arrLibraryCache.expiresAt) {
    return arrLibraryCache;
  }
  if (arrLibraryLoad) return arrLibraryLoad;

  arrLibraryLoad = (async () => {
    const ids = new Set<string>();
    const downloadedMovieIds = new Set<string>();
    const instances = await getIntegrationInstances();

    await Promise.all(
      instances.map(async (instance) => {
        const decrypted = await getDecryptedArrInstance(instance.id);
        if (!decrypted) return;

        try {
          if (instance.type === "radarr") {
            const movies = await getRadarrMovies(decrypted);
            for (const movie of movies) {
              if (!movie.tmdbId) continue;
              const key = `movie:${movie.tmdbId}`;
              ids.add(key);
              if (movie.hasFile) downloadedMovieIds.add(key);
            }
            return;
          }

          if (instance.type === "sonarr") {
            const series = await getSonarrSeries(decrypted);
            for (const show of series) {
              if (show.tmdbId) ids.add(`tv:${show.tmdbId}`);
            }
          }
        } catch {
          // Skip unreachable Arr instances
        }
      })
    );

    arrLibraryCache = { ids, downloadedMovieIds, expiresAt: Date.now() + CACHE_TTL_MS };
    return arrLibraryCache;
  })().finally(() => {
    arrLibraryLoad = null;
  });

  return arrLibraryLoad;
}

export async function getArrLibraryIds(): Promise<Set<string>> {
  const cache = await loadArrLibraryCache();
  return cache.ids;
}

/** Movies Radarr reports as having a file on disk (`hasFile`). */
export async function getDownloadedMovieIds(): Promise<Set<string>> {
  const cache = await loadArrLibraryCache();
  return cache.downloadedMovieIds;
}
