/** Stable IDs for home recommendation rows (settings + render order). */
export const HOME_ROW_IDS = [
  "for-you",
  "because-you-watched",
  "trending",
  "popular-tv",
  "upcoming-tv",
  "popular-movies",
  "upcoming-movies",
  "recent-requests",
] as const;

export type HomeRowId = (typeof HOME_ROW_IDS)[number];

export const HOME_ROW_LABELS: Record<HomeRowId, string> = {
  "for-you": "For You",
  "because-you-watched": "Because You Watched",
  trending: "Trending This Week",
  "popular-tv": "Popular TV Shows",
  "upcoming-tv": "Upcoming TV Shows",
  "popular-movies": "Popular Movies",
  "upcoming-movies": "Upcoming Movies",
  "recent-requests": "Recent Requests",
};

export const DEFAULT_HOME_ROW_ORDER: HomeRowId[] = [...HOME_ROW_IDS];

const HOME_ROW_ID_SET = new Set<string>(HOME_ROW_IDS);

export function isHomeRowId(value: string): value is HomeRowId {
  return HOME_ROW_ID_SET.has(value);
}

/** Merge saved order with defaults so new rows appear and unknowns are dropped. */
export function normalizeHomeRowOrder(saved: unknown): HomeRowId[] {
  const seen = new Set<HomeRowId>();
  const ordered: HomeRowId[] = [];

  if (Array.isArray(saved)) {
    for (const entry of saved) {
      if (typeof entry !== "string" || !isHomeRowId(entry) || seen.has(entry)) continue;
      seen.add(entry);
      ordered.push(entry);
    }
  }

  for (const id of DEFAULT_HOME_ROW_ORDER) {
    if (!seen.has(id)) ordered.push(id);
  }

  return ordered;
}
