import type { SearchCriteria, TmdbMediaItem } from "@/types";

export interface DateBounds {
  dateMin?: string;
  dateMax?: string;
}

/** Resolve yearMin/yearMax into ISO date bounds (and keep explicit dates). */
export function resolveDateBounds(
  criteria: Pick<SearchCriteria, "dateMin" | "dateMax" | "yearMin" | "yearMax">
): DateBounds {
  let dateMin = criteria.dateMin;
  let dateMax = criteria.dateMax;

  if (!dateMin && criteria.yearMin != null) {
    dateMin = `${criteria.yearMin}-01-01`;
  }
  if (!dateMax && criteria.yearMax != null) {
    dateMax = `${criteria.yearMax}-12-31`;
  }

  // Same calendar year via yearMin=yearMax without explicit dates.
  if (
    !criteria.dateMin &&
    !criteria.dateMax &&
    criteria.yearMin != null &&
    criteria.yearMax != null &&
    criteria.yearMin === criteria.yearMax
  ) {
    dateMin = `${criteria.yearMin}-01-01`;
    dateMax = `${criteria.yearMax}-12-31`;
  }

  return { dateMin, dateMax };
}

/** Copy year fields into dateMin/dateMax so every filter path sees dates. */
export function canonicalizeDateCriteria<T extends SearchCriteria>(criteria: T): T {
  const bounds = resolveDateBounds(criteria);
  const next = { ...criteria };

  if (bounds.dateMin) next.dateMin = bounds.dateMin;
  if (bounds.dateMax) next.dateMax = bounds.dateMax;

  if (next.dateMin && next.yearMin == null) {
    const y = Number.parseInt(next.dateMin.slice(0, 4), 10);
    if (Number.isFinite(y)) next.yearMin = y;
  }
  if (next.dateMax && next.yearMax == null) {
    const y = Number.parseInt(next.dateMax.slice(0, 4), 10);
    if (Number.isFinite(y)) next.yearMax = y;
  }

  return next;
}

export function hasDateCriteria(
  criteria: Pick<SearchCriteria, "dateMin" | "dateMax" | "yearMin" | "yearMax">
): boolean {
  const bounds = resolveDateBounds(criteria);
  return !!(bounds.dateMin || bounds.dateMax);
}

export function getMediaItemDate(item: TmdbMediaItem): string | null {
  const raw =
    item.media_type === "tv"
      ? item.first_air_date ?? item.release_date
      : item.media_type === "movie"
        ? item.release_date ?? item.first_air_date
        : item.release_date ?? item.first_air_date;
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  // Accept YYYY or YYYY-MM-DD from TMDB.
  if (/^\d{4}$/.test(trimmed)) return `${trimmed}-01-01`;
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  return null;
}

export function itemMatchesDateCriteria(
  item: TmdbMediaItem,
  criteria: Pick<SearchCriteria, "dateMin" | "dateMax" | "yearMin" | "yearMax">,
  options: { keepUndated?: boolean } = {}
): boolean {
  const bounds = resolveDateBounds(criteria);
  if (!bounds.dateMin && !bounds.dateMax) return true;

  const date = getMediaItemDate(item);
  if (!date) return options.keepUndated ?? false;
  if (bounds.dateMin && date < bounds.dateMin) return false;
  if (bounds.dateMax && date > bounds.dateMax) return false;
  return true;
}

export function filterItemsByDateCriteria<T extends TmdbMediaItem>(
  items: T[],
  criteria: Pick<SearchCriteria, "dateMin" | "dateMax" | "yearMin" | "yearMax">,
  options: { keepUndated?: boolean } = {}
): T[] {
  if (!hasDateCriteria(criteria)) return items;
  return items.filter((item) => itemMatchesDateCriteria(item, criteria, options));
}
