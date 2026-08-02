import { resolvePersonForUser } from "@/lib/recommendations/personal-people";
import {
  getGenres,
  searchKeyword,
} from "@/lib/integrations/tmdb/client";
import {
  MOVIE_EXTRA_GENRES,
  resolveExtraGenreId,
  STAND_UP_COMEDY_KEYWORD_ID,
} from "@/lib/discover/genres";
import { resolveMediaTitle } from "@/lib/search/resolve-media-title";
import type { MediaType, SearchCriteria } from "@/types";

const STAND_UP_GENRE_ID = -STAND_UP_COMEDY_KEYWORD_ID;

function resolveGenreId(name: string, genreMap: Map<string, number>): number | undefined {
  const normalized = name.toLowerCase().trim();
  const candidates = [normalized];

  if (normalized.endsWith("ies")) {
    candidates.push(`${normalized.slice(0, -3)}y`);
  } else if (normalized.endsWith("s") && !normalized.endsWith("ss")) {
    candidates.push(normalized.slice(0, -1));
  }

  for (const candidate of candidates) {
    const exact = genreMap.get(candidate);
    if (exact) return exact;
  }

  for (const candidate of candidates) {
    for (const [genreName, id] of genreMap) {
      if (genreName.includes(candidate) || candidate.includes(genreName)) {
        return id;
      }
    }
  }

  for (const candidate of candidates) {
    const words = candidate.split(/[\s,/]+/).filter((w) => w.length > 2);
    for (const word of words) {
      const wordMatch = genreMap.get(word);
      if (wordMatch) return wordMatch;
    }
  }

  return undefined;
}

export async function normalizeChatCriteria(
  raw: Record<string, unknown>,
  userId?: string
): Promise<SearchCriteria> {
  const result: SearchCriteria = {};

  const numericFields = [
    "yearMin",
    "yearMax",
    "minRating",
    "runtimeMin",
    "runtimeMax",
  ] as const;
  for (const field of numericFields) {
    if (typeof raw[field] === "number") {
      result[field] = raw[field];
    }
  }

  const booleanFields = ["excludeWatched", "excludeInLibrary", "excludeHidden"] as const;
  for (const field of booleanFields) {
    if (typeof raw[field] === "boolean") {
      result[field] = raw[field];
    }
  }

  if (typeof raw.dateMin === "string") result.dateMin = raw.dateMin;
  if (typeof raw.dateMax === "string") result.dateMax = raw.dateMax;
  if (typeof raw.language === "string") result.language = raw.language;
  if (typeof raw.mood === "string") result.mood = raw.mood;

  if (raw.mediaType === "movie" || raw.mediaType === "tv" || raw.mediaType === "all") {
    result.mediaType = raw.mediaType;
  } else if (Array.isArray(raw.keywords) && raw.keywords.some((k) => typeof k === "string" && k.toLowerCase().includes("sitcom"))) {
    result.mediaType = "tv";
  }

  const preferredType: MediaType = result.mediaType === "movie" ? "movie" : "tv";
  const genreNames = raw.genres;
  if (Array.isArray(genreNames) && genreNames.length > 0) {
    const [movieGenres, tvGenres] = await Promise.all([
      getGenres("movie"),
      getGenres("tv"),
    ]);
    const genreMap = new Map<string, number>();
    for (const genre of [...movieGenres.genres, ...tvGenres.genres, ...MOVIE_EXTRA_GENRES]) {
      genreMap.set(genre.name.toLowerCase(), genre.id);
    }

    const ids: number[] = [];
    for (const name of genreNames) {
      if (typeof name !== "string") continue;
      const id = resolveGenreId(name, genreMap);
      if (id) {
        ids.push(id);
        continue;
      }
      const extraId = resolveExtraGenreId(name);
      if (extraId) {
        ids.push(extraId);
      }
    }
    if (ids.length) {
      let uniqueIds = [...new Set(ids)];
      const wantsSitcom = Array.isArray(raw.keywords) &&
        raw.keywords.some((k) => typeof k === "string" && k.toLowerCase() === "sitcom");

      if (wantsSitcom || raw.mediaType === "tv") {
        result.mediaType = "tv";
        uniqueIds = uniqueIds.filter((id) => id !== STAND_UP_GENRE_ID);
      } else if (uniqueIds.includes(STAND_UP_GENRE_ID)) {
        result.mediaType = result.mediaType === "tv" ? "movie" : (result.mediaType ?? "movie");
        const comedyId = genreMap.get("comedy");
        if (comedyId) {
          uniqueIds = uniqueIds.filter((id) => id !== comedyId);
        }
      }
      result.genres = uniqueIds;
    }
  }

  if (!result.mediaType && result.genres?.length) {
    result.mediaType = "all";
  }

  const keywords = raw.keywords;
  if (Array.isArray(keywords) && keywords.length > 0) {
    const stringKeywords = keywords.filter((k): k is string => typeof k === "string");
    if (stringKeywords.length) result.keywords = [...new Set(stringKeywords)];

    const keywordIds: number[] = [];
    const skipComedyKeyword =
      result.mediaType === "tv" ||
      keywords.some((k) => typeof k === "string" && k.toLowerCase() === "sitcom");

    for (const kw of keywords.slice(0, 5)) {
      if (typeof kw !== "string") continue;
      if (skipComedyKeyword && kw.toLowerCase() === "comedy") continue;
      try {
        const search = await searchKeyword(kw);
        if (search.results[0]) keywordIds.push(search.results[0].id);
      } catch {
        // skip unresolved keywords
      }
    }
    if (keywordIds.length) result.withKeywords = keywordIds.join(",");
  }

  if (typeof raw.moreLikeTitle === "string" && raw.moreLikeTitle.trim()) {
    const requestedTitle = raw.moreLikeTitle.trim();
    const preferredType =
      result.mediaType === "movie" || result.mediaType === "tv" || result.mediaType === "all"
        ? result.mediaType
        : undefined;

    try {
      const resolved = await resolveMediaTitle(requestedTitle, preferredType);
      if (resolved) {
        result.moreLike = {
          tmdbId: resolved.tmdbId,
          mediaType: resolved.mediaType,
          title: resolved.title,
        };
        if (!result.mediaType || result.mediaType === "all") {
          result.mediaType = resolved.mediaType;
        }
      } else {
        result.moreLikeUnresolved = requestedTitle;
      }
    } catch {
      result.moreLikeUnresolved = requestedTitle;
    }
  } else if (
    raw.moreLike &&
    typeof raw.moreLike === "object" &&
    raw.moreLike !== null &&
    "tmdbId" in raw.moreLike
  ) {
    result.moreLike = raw.moreLike as SearchCriteria["moreLike"];
  }

  if (Array.isArray(raw.exclusions)) {
    result.exclusions = raw.exclusions.filter((e): e is string => typeof e === "string");
  }

  const personName =
    typeof raw.withPersonName === "string" ? raw.withPersonName.trim() : "";
  if (personName) {
    const creditType =
      raw.withPersonCreditType === "cast" ||
      raw.withPersonCreditType === "crew" ||
      raw.withPersonCreditType === "both"
        ? raw.withPersonCreditType
        : "both";

    try {
      const match = userId
        ? await resolvePersonForUser(userId, personName, creditType)
        : null;

      if (match) {
        result.withPerson = {
          tmdbId: match.tmdbId,
          name: match.name,
          creditType,
          ...(creditType === "crew" ? { crewRole: "creator" as const } : {}),
        };
        if (creditType === "cast") {
          result.withCast = [match.tmdbId];
        } else if (creditType === "crew") {
          result.withCrew = [match.tmdbId];
        } else {
          result.withCrew = [match.tmdbId];
          result.withCast = [match.tmdbId];
        }
      } else {
        result.withPersonUnresolved = personName;
      }
    } catch {
      // skip if person search fails
    }
  }

  return result;
}
