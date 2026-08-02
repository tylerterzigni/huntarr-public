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
    throw new Error(`Radarr error ${res.status}: ${text}`);
  }
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

export async function testRadarrConnection(instance: DecryptedInstance<ArrCredentials>) {
  await arrFetch(instance, "/system/status");
  return true;
}

export async function getRadarrProfiles(instance: DecryptedInstance<ArrCredentials>) {
  return arrFetch<Array<{ id: number; name: string }>>(instance, "/qualityprofile");
}

export async function getRadarrRootFolders(instance: DecryptedInstance<ArrCredentials>) {
  return arrFetch<Array<{ id: number; path: string }>>(instance, "/rootfolder");
}

export async function lookupRadarrMovie(instance: DecryptedInstance<ArrCredentials>, tmdbId: number) {
  try {
    const byTmdbId = await arrFetch<Record<string, unknown> | Array<Record<string, unknown>>>(
      instance,
      `/movie/lookup/tmdb?tmdbId=${tmdbId}`
    );

    if (Array.isArray(byTmdbId)) {
      const match = byTmdbId.find((m) => Number(m.tmdbId) === tmdbId) ?? byTmdbId[0];
      if (match) return match;
    } else if (byTmdbId && typeof byTmdbId === "object" && byTmdbId.tmdbId) {
      return byTmdbId;
    }
  } catch {
    // Fall through to term-based lookup
  }

  const byTerm = await arrFetch<Array<Record<string, unknown>>>(
    instance,
    `/movie/lookup?term=${encodeURIComponent(`tmdb:${tmdbId}`)}`
  );
  return byTerm.find((m) => Number(m.tmdbId) === tmdbId) ?? byTerm[0] ?? null;
}

export async function addRadarrMovie(
  instance: DecryptedInstance<ArrCredentials>,
  movie: Record<string, unknown>
) {
  return arrFetch(instance, "/movie", {
    method: "POST",
    body: JSON.stringify(movie),
  });
}

export async function getRadarrMovies(instance: DecryptedInstance<ArrCredentials>) {
  return arrFetch<Array<{ tmdbId: number; title: string }>>(instance, "/movie");
}
