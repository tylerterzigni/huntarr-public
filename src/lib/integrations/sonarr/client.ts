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

export async function addSonarrSeries(
  instance: DecryptedInstance<ArrCredentials>,
  series: Record<string, unknown>
) {
  return arrFetch<{ id: number } & Record<string, unknown>>(instance, "/series", {
    method: "POST",
    body: JSON.stringify(series),
  });
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
