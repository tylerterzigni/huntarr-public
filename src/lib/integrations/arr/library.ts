import { getRadarrMovies } from "@/lib/integrations/radarr/client";
import { getSonarrSeries } from "@/lib/integrations/sonarr/client";
import { getDecryptedArrInstance, getIntegrationInstances } from "@/lib/settings/integrations";

const CACHE_TTL_MS = 5 * 60 * 1000;

let arrLibraryCache: { ids: Set<string>; expiresAt: number } | null = null;

export function clearArrLibraryCache() {
  arrLibraryCache = null;
}

export async function getArrLibraryIds(): Promise<Set<string>> {
  if (arrLibraryCache && Date.now() < arrLibraryCache.expiresAt) {
    return arrLibraryCache.ids;
  }

  const ids = new Set<string>();
  const instances = await getIntegrationInstances();

  await Promise.all(
    instances.map(async (instance) => {
      const decrypted = await getDecryptedArrInstance(instance.id);
      if (!decrypted) return;

      try {
        if (instance.type === "radarr") {
          const movies = await getRadarrMovies(decrypted);
          for (const movie of movies) {
            if (movie.tmdbId) ids.add(`movie:${movie.tmdbId}`);
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

  arrLibraryCache = { ids, expiresAt: Date.now() + CACHE_TTL_MS };
  return ids;
}
