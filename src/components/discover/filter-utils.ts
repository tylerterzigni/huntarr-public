import {
  DEFAULT_DISCOVER_COUNTRIES,
  DEFAULT_DISCOVER_LANGUAGE,
} from "@/lib/discover/constants";

export function parseListParam(value: string | null | undefined): string[] {
  if (value === undefined || value === null) return [];
  if (value === "") return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function getParam(
  params: Record<string, string | undefined> | URLSearchParams,
  key: string
): string | null | undefined {
  if (params instanceof URLSearchParams) {
    return params.has(key) ? params.get(key) : undefined;
  }
  return key in params ? params[key] : undefined;
}

/** True when any discover filter param is set (including locale filters). */
export function hasDiscoverFilters(
  params: Record<string, string | undefined> | URLSearchParams,
  mediaType: "movie" | "tv"
): boolean {
  if (getParam(params, "genres")) return true;
  if (getParam(params, "keywords")) return true;
  if (getParam(params, "excludeKeywords")) return true;
  if (
    getParam(params, "dateMin") ||
    getParam(params, "dateMax") ||
    getParam(params, "yearMin") ||
    getParam(params, "yearMax")
  ) {
    return true;
  }
  if (getParam(params, "minRating") || getParam(params, "maxRating")) return true;
  if (mediaType === "movie" && (getParam(params, "runtimeMin") || getParam(params, "runtimeMax"))) {
    return true;
  }
  if (mediaType === "tv" && getParam(params, "status")) return true;
  if (getParam(params, "countries") !== undefined) return true;
  if (getParam(params, "language") !== undefined) return true;
  return false;
}

/** Applies default English + US/UK locale filters when discover search is active. */
export function resolveDiscoverLocaleLists(
  params: Record<string, string | undefined> | URLSearchParams,
  mediaType: "movie" | "tv"
): { countries: string[]; languages: string[] } {
  const countriesParam = getParam(params, "countries");
  const languageParam = getParam(params, "language");
  const filtering = hasDiscoverFilters(params, mediaType);

  let countries = parseListParam(countriesParam);
  let languages = parseListParam(languageParam);

  if (filtering) {
    if (countriesParam === undefined) countries = [...DEFAULT_DISCOVER_COUNTRIES];
    if (languageParam === undefined) languages = [DEFAULT_DISCOVER_LANGUAGE];
  }

  return { countries, languages };
}
export function serializeDiscoverParams(
  params: Record<string, string | undefined>
): string {
  const entries = Object.entries(params)
    .filter(([, value]) => Boolean(value))
    .sort(([a], [b]) => a.localeCompare(b));

  return new URLSearchParams(entries as [string, string][]).toString();
}

function hasRange(min: string | null, max: string | null): boolean {
  return Boolean(min || max);
}

export function countActiveFilters(
  params: URLSearchParams,
  mediaType: "movie" | "tv"
): number {
  let count = 0;

  if (params.get("genres")) count++;
  if (params.get("keywords")) count++;
  if (params.get("excludeKeywords")) count++;
  if (hasRange(params.get("dateMin"), params.get("dateMax")) ||
      hasRange(params.get("yearMin"), params.get("yearMax"))) count++;
  if (hasRange(params.get("minRating"), params.get("maxRating"))) count++;
  if (mediaType === "movie" && hasRange(params.get("runtimeMin"), params.get("runtimeMax"))) count++;
  const { countries, languages } = resolveDiscoverLocaleLists(params, mediaType);
  if (countries.length > 0) count++;
  if (languages.length > 0) count++;
  if (mediaType === "tv" && params.get("status")) count++;

  return count;
}
