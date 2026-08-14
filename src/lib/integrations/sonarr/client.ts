import type { DecryptedInstance } from "@/lib/settings/integrations";
import type { ArrCredentials } from "@/types";

async function arrFetch<T>(
  instance: DecryptedInstance<ArrCredentials>,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${instance.baseUrl}/api/v3${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": instance.credentials.apiKey,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sonarr error ${res.status}: ${text}`);
  }
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

export async function testSonarrConnection(instance: DecryptedInstance<ArrCredentials>) {
  await arrFetch(instance, "/system/status");
  return true;
}

export async function getSonarrProfiles(instance: DecryptedInstance<ArrCredentials>) {
  return arrFetch<Array<{ id: number; name: string }>>(instance, "/qualityprofile");
}

export async function getSonarrLanguageProfiles(instance: DecryptedInstance<ArrCredentials>) {
  return arrFetch<Array<{ id: number; name: string }>>(instance, "/languageprofile");
}

export async function getSonarrRootFolders(instance: DecryptedInstance<ArrCredentials>) {
  return arrFetch<Array<{ id: number; path: string }>>(instance, "/rootfolder");
}

export async function lookupSonarrSeries(instance: DecryptedInstance<ArrCredentials>, tvdbId: number) {
  const results = await arrFetch<Array<Record<string, unknown>>>(
    instance,
    `/series/lookup?term=tvdb:${tvdbId}`
  );
  return results[0] ?? null;
}

export async function lookupSonarrByTmdb(instance: DecryptedInstance<ArrCredentials>, tmdbId: number) {
  const results = await arrFetch<Array<Record<string, unknown>>>(
    instance,
    `/series/lookup?term=tmdb:${tmdbId}`
  );
  return results[0] ?? null;
}

export type SonarrSeriesResource = { id: number } & Record<string, unknown>;

export async function addSonarrSeries(
  instance: DecryptedInstance<ArrCredentials>,
  series: Record<string, unknown>
) {
  return arrFetch<SonarrSeriesResource>(instance, "/series", {
    method: "POST",
    body: JSON.stringify(series),
  });
}

export async function updateSonarrSeries(
  instance: DecryptedInstance<ArrCredentials>,
  series: SonarrSeriesResource
) {
  return arrFetch<SonarrSeriesResource>(instance, `/series/${series.id}`, {
    method: "PUT",
    body: JSON.stringify(series),
  });
}

export async function getSonarrSeriesById(
  instance: DecryptedInstance<ArrCredentials>,
  seriesId: number
) {
  return arrFetch<SonarrSeriesResource>(instance, `/series/${seriesId}`);
}

/** Returns the library series if it is already in Sonarr; otherwise null. */
export async function findExistingSonarrSeries(
  instance: DecryptedInstance<ArrCredentials>,
  ids: { seriesId?: number; tvdbId?: number; tmdbId?: number }
): Promise<SonarrSeriesResource | null> {
  if (ids.seriesId && ids.seriesId > 0) {
    try {
      const found = await getSonarrSeriesById(instance, ids.seriesId);
      if (seriesMatchesIds(found, ids)) return found;
    } catch {
      // Lookup payloads sometimes include a stale id; try tvdb/tmdb next.
    }
  }

  if (ids.tvdbId && ids.tvdbId > 0) {
    const matches = await arrFetch<SonarrSeriesResource[]>(
      instance,
      `/series?tvdbId=${ids.tvdbId}`
    );
    const match = matches.find((series) => Number(series.tvdbId) === ids.tvdbId);
    if (match) return match;
  }

  if (ids.tmdbId && ids.tmdbId > 0) {
    const all = await getSonarrSeries(instance);
    const match = all.find((show) => show.tmdbId === ids.tmdbId);
    if (match) {
      try {
        return await getSonarrSeriesById(instance, match.id);
      } catch {
        return null;
      }
    }
  }

  return null;
}

function seriesMatchesIds(
  series: SonarrSeriesResource,
  ids: { tvdbId?: number; tmdbId?: number }
) {
  if (ids.tvdbId && series.tvdbId != null && Number(series.tvdbId) !== ids.tvdbId) {
    return false;
  }
  if (ids.tmdbId && series.tmdbId != null && Number(series.tmdbId) !== ids.tmdbId) {
    return false;
  }
  return true;
}

export async function getSonarrSeries(instance: DecryptedInstance<ArrCredentials>) {
  return arrFetch<
    Array<{
      id: number;
      tvdbId: number;
      tmdbId?: number;
      title: string;
      seasons?: Array<{
        seasonNumber: number;
        statistics?: {
          episodeFileCount?: number;
          episodeCount?: number;
          totalEpisodeCount?: number;
          percentOfEpisodes?: number;
        };
      }>;
    }>
  >(instance, "/series");
}

export async function getSonarrEpisodes(instance: DecryptedInstance<ArrCredentials>, seriesId: number) {
  return arrFetch<
    Array<{
      id: number;
      seasonNumber: number;
      episodeNumber: number;
      hasFile: boolean;
      monitored: boolean;
    }>
  >(instance, `/episode?seriesId=${seriesId}`);
}

export async function setSonarrEpisodeMonitor(
  instance: DecryptedInstance<ArrCredentials>,
  episodeIds: number[],
  monitored: boolean
) {
  if (episodeIds.length === 0) return;
  return arrFetch(instance, "/episode/monitor", {
    method: "PUT",
    body: JSON.stringify({ episodeIds, monitored }),
  });
}

export async function searchSonarrEpisodes(
  instance: DecryptedInstance<ArrCredentials>,
  episodeIds: number[]
) {
  if (episodeIds.length === 0) return;
  return arrFetch(instance, "/command", {
    method: "POST",
    body: JSON.stringify({ name: "EpisodeSearch", episodeIds }),
  });
}

export async function searchSonarrSeason(
  instance: DecryptedInstance<ArrCredentials>,
  seriesId: number,
  seasonNumber: number
) {
  return arrFetch(instance, "/command", {
    method: "POST",
    body: JSON.stringify({ name: "SeasonSearch", seriesId, seasonNumber }),
  });
}
