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

export type SonarrLookupQuery = {
  tmdbId: number;
  tvdbId?: number | null;
  imdbId?: string | null;
  title?: string | null;
};

async function lookupByTerm(
  instance: DecryptedInstance<ArrCredentials>,
  term: string
) {
  return arrFetch<Array<Record<string, unknown>>>(
    instance,
    `/series/lookup?term=${encodeURIComponent(term)}`
  );
}

function normalizeSeriesTitle(title: string) {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function pickMatchingSeries(
  results: Array<Record<string, unknown>>,
  query: SonarrLookupQuery,
  allowFirst: boolean
): Record<string, unknown> | null {
  if (results.length === 0) return null;

  if (query.tvdbId && query.tvdbId > 0) {
    const match = results.find((series) => Number(series.tvdbId) === query.tvdbId);
    if (match) return match;
  }

  if (query.tmdbId > 0) {
    const match = results.find((series) => Number(series.tmdbId) === query.tmdbId);
    if (match) return match;
  }

  const imdb = query.imdbId?.trim().toLowerCase();
  if (imdb) {
    const match = results.find(
      (series) => String(series.imdbId ?? "").toLowerCase() === imdb
    );
    if (match) return match;
  }

  const wantTitle = query.title ? normalizeSeriesTitle(query.title) : "";
  if (wantTitle) {
    const exact = results.find(
      (series) => normalizeSeriesTitle(String(series.title ?? "")) === wantTitle
    );
    if (exact) return exact;

    const contains = results.filter((series) => {
      const got = normalizeSeriesTitle(String(series.title ?? ""));
      return got.includes(wantTitle) || wantTitle.includes(got);
    });
    if (contains.length === 1) return contains[0];
    if (contains.length > 1 && allowFirst) return contains[0];
  }

  if (allowFirst || results.length === 1) return results[0] ?? null;
  return null;
}

/**
 * Resolve a TMDB series to a Sonarr lookup payload.
 * Sonarr/Skyhook is TVDB-first; `tmdb:` often returns nothing even when the
 * show is searchable by TVDB ID, IMDb ID, or title.
 */
export async function lookupSonarrSeriesMatch(
  instance: DecryptedInstance<ArrCredentials>,
  query: SonarrLookupQuery
): Promise<Record<string, unknown> | null> {
  if (query.tvdbId && query.tvdbId > 0) {
    const match = pickMatchingSeries(
      await lookupByTerm(instance, `tvdb:${query.tvdbId}`),
      query,
      true
    );
    if (match) return match;
  }

  const imdb = query.imdbId?.trim();
  if (imdb) {
    const match = pickMatchingSeries(
      await lookupByTerm(instance, `imdb:${imdb}`),
      query,
      true
    );
    if (match) return match;
  }

  if (query.tmdbId > 0) {
    const match = pickMatchingSeries(
      await lookupByTerm(instance, `tmdb:${query.tmdbId}`),
      query,
      true
    );
    if (match) return match;
  }

  const title = query.title?.trim();
  if (title) {
    const match = pickMatchingSeries(await lookupByTerm(instance, title), query, false);
    if (match) return match;
  }

  return null;
}

export async function lookupSonarrSeries(instance: DecryptedInstance<ArrCredentials>, tvdbId: number) {
  return lookupSonarrSeriesMatch(instance, { tmdbId: 0, tvdbId });
}

export async function lookupSonarrByTmdb(instance: DecryptedInstance<ArrCredentials>, tmdbId: number) {
  return lookupSonarrSeriesMatch(instance, { tmdbId });
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
