import { getTmdbApiKey } from "@/lib/settings/global";

export type ResolvedTmdb = { tmdbId: number; mediaType: "movie" | "tv" };

const cache = new Map<string, ResolvedTmdb | null>();

function cacheKey(guid: string, mediaType?: string) {
  return `${guid}|${mediaType ?? ""}`;
}

async function tmdbFind(
  externalSource: "imdb_id" | "tvdb_id",
  externalId: string,
  prefer: "movie" | "tv"
): Promise<ResolvedTmdb | null> {
  const apiKey = await getTmdbApiKey();
  if (!apiKey) return null;

  const url = new URL(`https://api.themoviedb.org/3/find/${externalId}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("external_source", externalSource);

  const res = await fetch(url.toString(), { next: { revalidate: 86400 } });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    movie_results?: Array<{ id: number }>;
    tv_results?: Array<{ id: number }>;
  };

  if (prefer === "movie" && data.movie_results?.[0]) {
    return { tmdbId: data.movie_results[0].id, mediaType: "movie" };
  }
  if (data.tv_results?.[0]) {
    return { tmdbId: data.tv_results[0].id, mediaType: "tv" };
  }
  if (data.movie_results?.[0]) {
    return { tmdbId: data.movie_results[0].id, mediaType: "movie" };
  }
  return null;
}

/** Resolve a Plex/Tautulli agent GUID to a TMDB id (uses TMDB /find for IMDB/TVDB). */
export async function resolveTmdbFromGuid(
  guid: string,
  hint?: { mediaType?: "movie" | "tv" | "episode" }
): Promise<ResolvedTmdb | null> {
  if (!guid) return null;

  const key = cacheKey(guid, hint?.mediaType);
  if (cache.has(key)) return cache.get(key)!;

  let result: ResolvedTmdb | null = null;

  const tmdbMatch = guid.match(/(?:themoviedb|tmdb):\/\/(\d+)/i);
  if (tmdbMatch) {
    const tmdbId = parseInt(tmdbMatch[1], 10);
    const isTv =
      hint?.mediaType === "tv" ||
      hint?.mediaType === "episode" ||
      /type=series/i.test(guid) ||
      /agents\.thetvdb:\/\//i.test(guid);
    result = { tmdbId, mediaType: isTv ? "tv" : "movie" };
  }

  if (!result) {
    const legacyTmdbMatch = guid.match(/agents\.themoviedb:\/\/(\d+)/i);
    if (legacyTmdbMatch) {
      const tmdbId = parseInt(legacyTmdbMatch[1], 10);
      const isTv = hint?.mediaType === "tv" || hint?.mediaType === "episode";
      result = { tmdbId, mediaType: isTv ? "tv" : "movie" };
    }
  }

  if (!result) {
    const tvdbMatch = guid.match(/(?:thetvdb|tvdb):\/\/(\d+)/i);
    if (tvdbMatch) {
      result = await tmdbFind("tvdb_id", tvdbMatch[1], "tv");
    }
  }

  if (!result) {
    const legacyTvdbMatch = guid.match(/agents\.thetvdb:\/\/(\d+)/i);
    if (legacyTvdbMatch) {
      result = await tmdbFind("tvdb_id", legacyTvdbMatch[1], "tv");
    }
  }

  if (!result) {
    const imdbMatch = guid.match(/imdb:\/\/(tt\d+)/i);
    if (imdbMatch) {
      const prefer = hint?.mediaType === "episode" || hint?.mediaType === "tv" ? "tv" : "movie";
      result = await tmdbFind("imdb_id", imdbMatch[1], prefer);
      if (!result && prefer === "movie") {
        result = await tmdbFind("imdb_id", imdbMatch[1], "tv");
      }
    }
  }

  if (!result) {
    const legacyImdbMatch = guid.match(/agents\.imdb:\/\/(tt\d+)/i);
    if (legacyImdbMatch) {
      const prefer = hint?.mediaType === "episode" || hint?.mediaType === "tv" ? "tv" : "movie";
      result = await tmdbFind("imdb_id", legacyImdbMatch[1], prefer);
      if (!result && prefer === "movie") {
        result = await tmdbFind("imdb_id", legacyImdbMatch[1], "tv");
      }
    }
  }

  cache.set(key, result);
  return result;
}

export function clearGuidResolutionCache() {
  cache.clear();
}

/** Try multiple agent GUID strings; returns first resolvable TMDB match. */
export async function resolveTmdbFromGuidList(
  guids: string[],
  hint?: { mediaType?: "movie" | "tv" | "episode" }
): Promise<ResolvedTmdb | null> {
  for (const guid of guids) {
    const resolved = await resolveTmdbFromGuid(guid, hint);
    if (resolved) return resolved;
  }
  return null;
}
