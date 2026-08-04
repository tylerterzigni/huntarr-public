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
import { getMediaTitle } from "@/lib/integrations/tmdb/helpers";
import { loadPersonCreditEntries } from "@/lib/recommendations/person-credits";
import { resolveMediaTitle } from "@/lib/search/resolve-media-title";
import { titleMatchScore } from "@/lib/search/rank-search-results";
import { textsLikelyMatch } from "@/lib/search/fuzzy-text-match";
import { canonicalizeDateCriteria } from "@/lib/search/date-criteria";
import { cleanMoreLikeTitleCandidate } from "@/lib/ai/parse-chat-response";
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
    const value = raw[field];
    if (typeof value === "number" && Number.isFinite(value)) {
      result[field] = value;
    } else if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) result[field] = parsed;
    }
  }

  const booleanFields = ["excludeWatched", "excludeInLibrary", "excludeHidden"] as const;
  for (const field of booleanFields) {
    if (typeof raw[field] === "boolean") {
      result[field] = raw[field];
    }
  }

  if (typeof raw.dateMin === "string" && raw.dateMin.trim()) result.dateMin = raw.dateMin.trim();
  if (typeof raw.dateMax === "string" && raw.dateMax.trim()) result.dateMax = raw.dateMax.trim();
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

  if (typeof raw.moreLikeTitle === "string" && raw.moreLikeTitle.trim()) {
    const requestedTitle = cleanMoreLikeTitleCandidate(raw.moreLikeTitle.trim());
    if (!requestedTitle) {
      // fall through — no resolvable title
    } else {
    const preferredType =
      result.mediaType === "movie" || result.mediaType === "tv" || result.mediaType === "all"
        ? result.mediaType
        : undefined;

    try {
      let resolved: Awaited<ReturnType<typeof resolveMediaTitle>> = null;

      // “Like Shrinking by Bill Lawrence” — prefer a title from that person’s credits.
      if (result.withPerson?.tmdbId) {
        const credits = await loadPersonCreditEntries(
          result.withPerson.tmdbId,
          result.withPerson.creditType ?? "both"
        );
        const typed =
          preferredType === "movie" || preferredType === "tv"
            ? credits.filter((entry) => entry.mediaType === preferredType)
            : credits;
        const pool = typed.length > 0 ? typed : credits;

        let best: (typeof pool)[number] | null = null;
        let bestScore = -1;
        for (const entry of pool) {
          const title = getMediaTitle(entry.item);
          const score = titleMatchScore(requestedTitle, title);
          if (score < 0 && !textsLikelyMatch(requestedTitle, title, { mode: "title" })) {
            continue;
          }
          const weighted = Math.max(score, 0) + (entry.item.popularity ?? 0);
          if (weighted > bestScore) {
            bestScore = weighted;
            best = entry;
          }
        }

        if (
          best &&
          (bestScore >= 750 ||
            textsLikelyMatch(requestedTitle, getMediaTitle(best.item), { mode: "title" }))
        ) {
          resolved = {
            tmdbId: best.id,
            mediaType: best.mediaType,
            title: getMediaTitle(best.item),
            source: "tmdb",
          };
        }
      }

      if (!resolved) {
        resolved = await resolveMediaTitle(requestedTitle, preferredType);
      }

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
    }
  } else if (
    raw.moreLike &&
    typeof raw.moreLike === "object" &&
    raw.moreLike !== null &&
    "tmdbId" in raw.moreLike
  ) {
    result.moreLike = raw.moreLike as SearchCriteria["moreLike"];
  }

  return canonicalizeDateCriteria(result);
}
