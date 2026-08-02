import { parseListParam, resolveDiscoverLocaleLists } from "@/components/discover/filter-utils";
import { mergeKeywordIds, resolveGenreFilters } from "@/lib/discover/genres";
import type { MediaType, SearchCriteria } from "@/types";

export function searchCriteriaToDiscoverParams(
  criteria: SearchCriteria
): Record<string, string | undefined> {
  const params: Record<string, string | undefined> = {};

  if (criteria.genres?.length) params.genres = criteria.genres.join(",");
  if (criteria.dateMin) params.dateMin = criteria.dateMin;
  if (criteria.dateMax) params.dateMax = criteria.dateMax;
  if (criteria.yearMin != null) params.yearMin = String(criteria.yearMin);
  if (criteria.yearMax != null) params.yearMax = String(criteria.yearMax);
  if (criteria.minRating != null) params.minRating = String(criteria.minRating);
  if (criteria.runtimeMin != null) params.runtimeMin = String(criteria.runtimeMin);
  if (criteria.runtimeMax != null) params.runtimeMax = String(criteria.runtimeMax);
  if (criteria.withKeywords) params.keywords = criteria.withKeywords;
  if (criteria.language) params.language = criteria.language;

  return params;
}

/** Same filter construction as Discover Movies / Discover TV pages. */
export function buildDiscoverFiltersForChat(
  criteria: SearchCriteria,
  mediaType: MediaType,
  overrides: Record<string, string> = {}
): Record<string, string> {
  const params = searchCriteriaToDiscoverParams(criteria);
  const base =
    mediaType === "movie"
      ? buildMovieDiscoverFilters(params)
      : buildTvDiscoverFilters(params);

  const filters: Record<string, string> = { ...base, ...overrides };

  if (criteria.withCast?.length) {
    filters.with_cast = criteria.withCast.join(",");
  }
  if (criteria.withCrew?.length) {
    filters.with_crew = criteria.withCrew.join(",");
  }

  return filters;
}

export function buildMovieDiscoverFilters(
  params: Record<string, string | undefined>
): Record<string, string> {
  const filters: Record<string, string> = {};
  const { countries, languages } = resolveDiscoverLocaleLists(params, "movie");

  if (params.genres) {
    const genreIds = parseListParam(params.genres).map(Number).filter(Number.isFinite);
    const { withGenres, extraKeywordIds } = resolveGenreFilters(genreIds);
    if (withGenres) filters.with_genres = withGenres;
    if (extraKeywordIds.length) {
      const merged = mergeKeywordIds(filters.with_keywords, extraKeywordIds);
      if (merged) filters.with_keywords = merged;
    }
  }
  if (params.dateMin) filters["primary_release_date.gte"] = params.dateMin;
  else if (params.yearMin) filters["primary_release_date.gte"] = `${params.yearMin}-01-01`;
  if (params.dateMax) filters["primary_release_date.lte"] = params.dateMax;
  else if (params.yearMax) filters["primary_release_date.lte"] = `${params.yearMax}-12-31`;
  if (params.minRating) filters["vote_average.gte"] = params.minRating;
  if (params.maxRating) filters["vote_average.lte"] = params.maxRating;
  if (params.runtimeMin) filters["with_runtime.gte"] = params.runtimeMin;
  if (params.runtimeMax) filters["with_runtime.lte"] = params.runtimeMax;
  if (countries.length > 0) filters.with_origin_country = countries.join("|");
  if (languages.length > 0) filters.with_original_language = languages.join("|");
  if (params.keywords) {
    const merged = mergeKeywordIds(
      filters.with_keywords,
      parseListParam(params.keywords).map(Number).filter(Boolean)
    );
    if (merged) filters.with_keywords = merged;
  }
  if (params.excludeKeywords) filters.without_keywords = params.excludeKeywords;

  return filters;
}

export function buildTvDiscoverFilters(
  params: Record<string, string | undefined>
): Record<string, string> {
  const filters: Record<string, string> = {};
  const { countries, languages } = resolveDiscoverLocaleLists(params, "tv");

  if (params.genres) filters.with_genres = params.genres;
  if (params.dateMin) filters["first_air_date.gte"] = params.dateMin;
  else if (params.yearMin) filters["first_air_date.gte"] = `${params.yearMin}-01-01`;
  if (params.dateMax) filters["first_air_date.lte"] = params.dateMax;
  else if (params.yearMax) filters["first_air_date.lte"] = `${params.yearMax}-12-31`;
  if (params.minRating) filters["vote_average.gte"] = params.minRating;
  if (params.maxRating) filters["vote_average.lte"] = params.maxRating;
  if (countries.length > 0) filters.with_origin_country = countries.join("|");
  if (languages.length > 0) filters.with_original_language = languages.join("|");
  if (params.keywords) filters.with_keywords = params.keywords;
  if (params.excludeKeywords) filters.without_keywords = params.excludeKeywords;
  if (params.status) filters.with_status = params.status.replace(/,/g, "|");

  return filters;
}
