/** TMDB keyword for stand-up comedy specials (not a native movie genre). */
export const STAND_UP_COMEDY_KEYWORD_ID = 9716;

export interface ExtraMovieGenre {
  id: number;
  name: string;
  keywordId: number;
}

/** Movie-only genres backed by TMDB keywords instead of genre IDs. IDs are negative to avoid collisions. */
export const MOVIE_EXTRA_GENRES: ExtraMovieGenre[] = [
  {
    id: -STAND_UP_COMEDY_KEYWORD_ID,
    name: "Stand-Up Comedy",
    keywordId: STAND_UP_COMEDY_KEYWORD_ID,
  },
];

export function isKeywordBackedGenreId(id: number): boolean {
  return MOVIE_EXTRA_GENRES.some((genre) => genre.id === id);
}

export function resolveExtraGenreId(name: string): number | undefined {
  const normalized = name.toLowerCase().trim().replace(/\s+/g, " ");
  for (const extra of MOVIE_EXTRA_GENRES) {
    const variants = [
      extra.name.toLowerCase(),
      extra.name.toLowerCase().replace(/-/g, " "),
    ];
    for (const variant of variants) {
      if (normalized === variant || normalized.includes(variant)) {
        return extra.id;
      }
    }
  }
  if (/\bstand[\s-]?up\b/i.test(normalized) && /\bcomedy\b/i.test(normalized)) {
    return MOVIE_EXTRA_GENRES[0]?.id;
  }
  return undefined;
}

export function mergeMovieGenres(
  tmdbGenres: Array<{ id: number; name: string }>
): Array<{ id: number; name: string }> {
  const extra = MOVIE_EXTRA_GENRES.map(({ id, name }) => ({ id, name }));
  return [...tmdbGenres, ...extra].sort((a, b) => a.name.localeCompare(b.name));
}

export function resolveGenreFilters(genreIds: number[]): {
  withGenres?: string;
  extraKeywordIds: number[];
} {
  const realIds: number[] = [];
  const extraKeywordIds: number[] = [];

  for (const id of genreIds) {
    const extra = MOVIE_EXTRA_GENRES.find((genre) => genre.id === id);
    if (extra) {
      extraKeywordIds.push(extra.keywordId);
    } else if (id > 0) {
      realIds.push(id);
    }
  }

  return {
    withGenres: realIds.length ? realIds.join(",") : undefined,
    extraKeywordIds,
  };
}

export function mergeKeywordIds(existing: string | undefined, extra: number[]): string | undefined {
  const ids = [
    ...(existing ? existing.split(",").map(Number).filter(Boolean) : []),
    ...extra,
  ];
  const unique = [...new Set(ids)];
  return unique.length ? unique.join(",") : undefined;
}
